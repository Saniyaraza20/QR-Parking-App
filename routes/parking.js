const express = require('express');
const crypto = require('crypto');
const { db, getConfig } = require('../db');
const { verifyEntryToken, signEntryToken } = require('../lib/qrToken');
const { optionalAuth } = require('../lib/auth');

const router = express.Router();

const VEHICLE_RE = /^[A-Z0-9\- ]{3,15}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashGuestToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Returns true if this request is allowed to see/act on `session`:
// either it's the logged-in driver who owns it, OR the caller presented the
// guest token that matches the one minted when the guest booked. This is the
// ownership check that replaces "driver_id === req.user.sub" now that
// sessions can be ownerless (guest) bookings - without it, a guest booking
// could be read by anyone who guessed its sequential ID.
function canAccessSession(session, req) {
  if (req.user && req.user.role === 'driver' && session.driver_id === req.user.sub) return true;
  const provided = req.get('x-guest-token') || req.query.guest_token;
  if (session.guest_token_hash && provided && hashGuestToken(provided) === session.guest_token_hash) return true;
  return false;
}

// Public - same info printed on the physical sign at the lot entrance.
router.get('/entry-link', (req, res) => {
  res.json({ url: `/entry?token=${signEntryToken()}` });
});

// Public rendered QR image (PNG data URL) of the entrance link, so the
// landing page can display the actual scannable code. Same code the staff
// print route produces - just reachable without login, because by design
// anyone walking up to the lot can scan it.
router.get('/qrcode', (req, res) => {
  const QRCode = require('qrcode');
  const base = `${req.protocol}://${req.get('host')}`;
  QRCode.toDataURL(`${base}/entry?token=${signEntryToken()}`, { margin: 1, width: 320 }, (err, dataUrl) => {
    if (err) return res.status(500).json({ error: 'Failed to generate QR code' });
    res.json({ dataUrl });
  });
});

// Public - confirm the QR is genuine before showing any forms.
router.get('/entry-info', (req, res) => {
  const { token } = req.query;
  if (!verifyEntryToken(token)) {
    db.prepare("INSERT INTO scan_events (event_type, reason) VALUES ('entry_qr_rejected', 'bad_token')").run();
    return res.status(403).json({ error: 'This QR code failed verification' });
  }
  db.prepare("INSERT INTO scan_events (event_type) VALUES ('entry_qr_verified')").run();
  res.json({
    ok: true,
    flat_fee_cents: Number(getConfig('flat_fee_cents', 5000)),
    session_duration_hours: Number(getConfig('session_duration_hours', 4)),
  });
});

// Public now - a guest needs to see open spots before deciding to book.
// (Only exposes id/code/label/status, nothing sensitive.)
router.get('/spots', (req, res) => {
  const spots = db.prepare('SELECT id, code, label, status FROM spots ORDER BY code').all();
  res.json({ spots });
});

// Reserve a spot. optionalAuth: if a driver is logged in the booking links to
// their account; if not, it's a guest booking and we mint a one-time guest
// token so only that guest can later read the booking/invoice.
router.post('/reserve', optionalAuth, (req, res) => {
  const { spot_id, name, email, vehicle_number, token } = req.body || {};

  if (!verifyEntryToken(token)) {
    return res.status(403).json({ error: 'This QR code failed verification - rescan it and try again' });
  }
  if (!spot_id) return res.status(400).json({ error: 'spot_id is required' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!vehicle_number || !VEHICLE_RE.test(vehicle_number)) {
    return res.status(400).json({ error: 'Enter a valid vehicle number (letters, numbers, spaces, dashes)' });
  }

  const isDriver = req.user && req.user.role === 'driver';
  const driverId = isDriver ? req.user.sub : null;
  const guestToken = isDriver ? null : crypto.randomBytes(24).toString('base64url');
  const guestTokenHash = guestToken ? hashGuestToken(guestToken) : null;

  const feeCents = Number(getConfig('flat_fee_cents', 5000));
  const normalizedPlate = vehicle_number.toUpperCase().trim();

  const reserve = db.transaction(() => {
    const updateResult = db
      .prepare("UPDATE spots SET status = 'occupied' WHERE id = ? AND status = 'available'")
      .run(spot_id);
    if (updateResult.changes === 0) return null;

    const info = db
      .prepare(
        `INSERT INTO sessions (spot_id, driver_id, guest_token_hash, driver_name, driver_email, vehicle_number, fee_cents, status, payment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_payment', 'pending')`
      )
      .run(spot_id, driverId, guestTokenHash, name.trim(), email.toLowerCase(), normalizedPlate, feeCents);

    db.prepare(
      'INSERT INTO scan_events (spot_id, session_id, event_type) VALUES (?, ?, ?)'
    ).run(spot_id, info.lastInsertRowid, 'reserved');

    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(info.lastInsertRowid);
  });

  const session = reserve();
  if (!session) {
    return res.status(409).json({ error: 'That spot was just taken - please pick another one' });
  }

  // The guest token is returned exactly once, to the guest who just booked -
  // their browser holds it for the rest of the flow. It is never stored in
  // plaintext server-side (only its hash).
  res.status(201).json({ session, guest_token: guestToken });
});

router.get('/sessions/:id', optionalAuth, (req, res) => {
  const session = db
    .prepare(
      `SELECT se.*, s.code AS spot_code FROM sessions se
       JOIN spots s ON s.id = se.spot_id WHERE se.id = ?`
    )
    .get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!canAccessSession(session, req)) return res.status(403).json({ error: 'Not your booking' });
  res.json({ session });
});

router.get('/sessions/:id/invoice', optionalAuth, (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!canAccessSession(session, req)) return res.status(403).json({ error: 'Not your booking' });

  const invoice = db.prepare('SELECT * FROM invoices WHERE session_id = ?').get(session.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not available yet - payment may still be processing' });

  res.json({ invoice });
});

module.exports = router;
