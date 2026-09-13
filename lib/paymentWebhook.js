const crypto = require('crypto');
const { db, getConfig } = require('../db');
const { buildInvoiceHtml } = require('./invoice');

// This is the ONE place that is allowed to mark a payment "paid" - and, in
// this prepaid model, the one place that turns a reservation into an actual
// active booking. Nothing else touches payment_status or moves a session out
// of pending_payment. It requires a valid HMAC signature over the raw
// request body, computed with a secret only the server (and, in real life,
// the payment provider) knows - so a driver's browser calling this with a
// forged body will fail signature verification and get rejected.
function verifyAndProcessWebhook(rawBody, signatureHeader) {
  const secret = getConfig('webhook_secret');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  if (!signatureHeader) return { ok: false, status: 400, error: 'Missing signature' };

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signatureHeader));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 400, error: 'Invalid webhook signature' };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { ok: false, status: 400, error: 'Malformed payload' };
  }

  const { payment_id, provider_ref, status } = payload;
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment_id);
  if (!payment) return { ok: false, status: 404, error: 'Unknown payment_id' };

  // Idempotent: the same provider event can be delivered more than once
  // (that's normal for webhooks) - re-processing must be a safe no-op.
  if (payment.status === 'paid') {
    return { ok: true, status: 200, alreadyProcessed: true, payment };
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(payment.session_id);
  if (!session) return { ok: false, status: 404, error: 'Session not found' };

  if (status !== 'succeeded') {
    const run = db.transaction(() => {
      db.prepare("UPDATE payments SET status = 'failed', provider_ref = ? WHERE id = ?").run(
        provider_ref || null,
        payment.id
      );
      db.prepare("UPDATE sessions SET status = 'payment_failed', payment_status = 'failed' WHERE id = ?").run(
        session.id
      );
      // Payment failed - the spot was held optimistically at reservation time, release it.
      db.prepare("UPDATE spots SET status = 'available' WHERE id = ?").run(session.spot_id);
    });
    run();
    return { ok: true, status: 200, failed: true, payment };
  }

  // Defense in depth: the amount actually charged must match what we billed.
  if (session.fee_cents !== payment.amount_cents) {
    return { ok: false, status: 409, error: 'Amount mismatch between session and payment record' };
  }

  const durationHours = Number(getConfig('session_duration_hours', 4));
  const expectedExit = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

  const run = db.transaction(() => {
    db.prepare("UPDATE payments SET status = 'paid', provider_ref = ? WHERE id = ?").run(
      provider_ref || null,
      payment.id
    );
    db.prepare(
      "UPDATE sessions SET payment_status = 'paid', status = 'active', expected_exit_time = ? WHERE id = ?"
    ).run(expectedExit, session.id);
  });
  run();

  const updatedSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
  const spot = db.prepare('SELECT code FROM spots WHERE id = ?').get(session.spot_id);

  // Generate + "send" (store) the invoice now that the booking is confirmed.
  const html = buildInvoiceHtml({ session: updatedSession, spotCode: spot.code });
  db.prepare(
    'INSERT INTO invoices (session_id, email, html) VALUES (?, ?, ?) ON CONFLICT(session_id) DO NOTHING'
  ).run(session.id, session.driver_email, html);

  return { ok: true, status: 200, payment: db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id), session: updatedSession };
}

function signPayload(rawBody) {
  const secret = getConfig('webhook_secret');
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

module.exports = { verifyAndProcessWebhook, signPayload };
