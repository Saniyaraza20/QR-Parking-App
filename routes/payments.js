const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { verifyAndProcessWebhook, signPayload } = require('../lib/paymentWebhook');
const { optionalAuth } = require('../lib/auth');

const router = express.Router();

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Same ownership rule as routes/parking.js: the logged-in driver who owns the
// session, or a guest presenting the matching one-time token. Kept in sync
// deliberately so a guest can pay for their own booking but not anyone else's.
function canAccessSession(session, req) {
  if (req.user && req.user.role === 'driver' && session.driver_id === req.user.sub) return true;
  const provided = req.get('x-guest-token') || req.query.guest_token;
  if (session.guest_token_hash && provided &&
      crypto.createHash('sha256').update(provided).digest('hex') === session.guest_token_hash) return true;
  return false;
}

// Step 1: app asks to start paying for a session. Creates a pending payment
// record (in real life would return a Stripe/Razorpay client_secret).
// Works for both logged-in drivers and guests - guests prove ownership with
// the token minted at reservation time. Nothing is charged here regardless.
router.post('/sessions/:id/payment-intent', paymentLimiter, optionalAuth, (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!canAccessSession(session, req)) return res.status(403).json({ error: 'Not your booking' });
  if (session.payment_status === 'paid') {
    return res.status(409).json({ error: 'Session already paid' });
  }
  if (!session.fee_cents || session.fee_cents <= 0) {
    return res.status(400).json({ error: 'Nothing owed on this session' });
  }

  const info = db
    .prepare('INSERT INTO payments (session_id, amount_cents, status) VALUES (?, ?, ?)')
    .run(session.id, session.fee_cents, 'pending');

  res.json({ payment_id: info.lastInsertRowid, session_id: session.id, amount_cents: session.fee_cents });
});

// Step 2: the ONLY route allowed to mark a payment paid. In production this is
// the URL you register with Stripe/Razorpay as your webhook endpoint - the
// provider calls it directly, the driver's browser never does.
router.post('/payments/webhook', (req, res) => {
  // req.rawBody is captured by the verify() hook on express.json() in server.js -
  // signing must happen over the exact bytes received, not a re-serialized object.
  const result = verifyAndProcessWebhook(req.rawBody, req.header('x-webhook-signature'));
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(result.status).json({ status: result.failed ? 'failed' : 'paid' });
});

// --- DEV ONLY --------------------------------------------------------------
// There's no real Stripe/Razorpay account wired up yet, so this route stands
// in for "the provider calling our webhook after a successful charge." It
// builds the exact same signed payload a real provider would send and posts
// it through the real verification path above - it does NOT bypass the
// signature check, it exercises it. Remove this route entirely once a real
// payment provider is integrated.
if (process.env.NODE_ENV !== 'production') {
  router.post('/payments/dev-simulate/:paymentId', paymentLimiter, (req, res) => {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.paymentId);
    if (!payment) return res.status(404).json({ error: 'Unknown payment_id' });

    const payload = {
      payment_id: payment.id,
      amount_cents: payment.amount_cents,
      status: 'succeeded',
      provider_ref: 'devsim_' + crypto.randomBytes(8).toString('hex'),
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = signPayload(rawBody);

    const result = verifyAndProcessWebhook(rawBody, signature);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json({ status: 'paid', simulated: true, provider_ref: payload.provider_ref });
  });
}

module.exports = router;
