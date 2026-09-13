const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { hashPassword, verifyPassword, signToken, requireAuth, requireRole } = require('../lib/auth');
const { isGoogleConfigured, verifyGoogleIdToken, findOrCreateGoogleDriver } = require('../lib/googleAuth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same brute-force protection pattern as staff login - separate limiter
// instance so a burst of driver signups doesn't lock out staff, or vice versa.
const driverAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});

// Self-service - unlike staff accounts, nobody has to create this for you,
// and there's no temp password to force-change: the driver picks their own
// password at signup, so it was never transmitted/stored anywhere in the
// clear beyond this one request.
router.post('/register', driverAuthLimiter, (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = db.prepare('SELECT id FROM drivers WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const info = db
    .prepare('INSERT INTO drivers (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase(), hashPassword(password));

  const token = signToken({ id: info.lastInsertRowid, role: 'driver', email: email.toLowerCase() });
  res.status(201).json({ token, driver: { id: info.lastInsertRowid, name: name.trim(), email: email.toLowerCase() } });
});

router.post('/login', driverAuthLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const driver = db.prepare('SELECT * FROM drivers WHERE email = ?').get(email.toLowerCase());
  if (!driver || !verifyPassword(password, driver.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken({ id: driver.id, role: 'driver', email: driver.email });
  res.json({ token, driver: { id: driver.id, name: driver.name, email: driver.email } });
});

router.get('/me', requireAuth, requireRole('driver'), (req, res) => {
  const driver = db.prepare('SELECT id, name, email, created_at FROM drivers WHERE id = ?').get(req.user.sub);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  res.json({ driver });
});

// Public - tells the frontend whether to render the "Sign in with Google"
// button at all. Never assume it's configured; this app must work fully
// with just email/password.
router.get('/oauth/google/config', (req, res) => {
  res.json({
    enabled: isGoogleConfigured(),
    client_id: isGoogleConfigured() ? process.env.GOOGLE_CLIENT_ID : null,
  });
});

router.post('/oauth/google', driverAuthLimiter, async (req, res) => {
  const { id_token } = req.body || {};
  if (!id_token) return res.status(400).json({ error: 'id_token is required' });

  let payload;
  try {
    payload = await verifyGoogleIdToken(id_token);
  } catch (err) {
    if (err.code === 'GOOGLE_NOT_CONFIGURED') {
      return res.status(501).json({ error: 'Google sign-in is not set up on this server' });
    }
    return res.status(401).json({ error: 'Could not verify Google sign-in' });
  }

  let driver;
  try {
    driver = findOrCreateGoogleDriver(payload);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const token = signToken({ id: driver.id, role: 'driver', email: driver.email });
  res.json({ token, driver: { id: driver.id, name: driver.name, email: driver.email } });
});

const RESET_TOKEN_TTL_MINUTES = 30;
const RESET_LINKS_FILE = path.join(__dirname, '..', 'PASSWORD_RESET_LINKS.local.txt');

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Self-service - always returns the same generic message whether or not the
// email exists, so this can't be used to check which emails have accounts.
router.post('/forgot-password', driverAuthLimiter, (req, res) => {
  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  const driver = db.prepare('SELECT * FROM drivers WHERE email = ?').get(email.toLowerCase());
  if (driver) {
    const rawToken = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
    db.prepare('INSERT INTO password_resets (driver_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
      driver.id,
      hashResetToken(rawToken),
      expiresAt
    );

    // No real email provider is wired up (same situation as payments and
    // invoices elsewhere in this app). A reset link is just as sensitive as
    // a password - whoever has it can take over the account - so exactly
    // like the seeded staff credentials, it is NEVER printed to the console
    // or logged. It's appended to a single git-ignored local file instead,
    // standing in for "the email that would have been sent."
    const resetUrl = `/driver/reset-password?token=${rawToken}`;
    fs.appendFileSync(
      RESET_LINKS_FILE,
      `[${new Date().toISOString()}] ${driver.email} -> ${resetUrl} (expires in ${RESET_TOKEN_TTL_MINUTES} min)\n`,
      { mode: 0o600 }
    );
  }

  res.json({ status: 'ok', message: 'If that email has an account, a reset link has been generated.' });
});

router.post('/reset-password', driverAuthLimiter, (req, res) => {
  const { token, new_password } = req.body || {};
  if (!token || !new_password) return res.status(400).json({ error: 'token and new_password are required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const tokenHash = hashResetToken(token);
  const reset = db
    .prepare(
      `SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`
    )
    .get(tokenHash);
  if (!reset) return res.status(400).json({ error: 'That reset link is invalid or has expired' });

  const run = db.transaction(() => {
    db.prepare('UPDATE drivers SET password_hash = ? WHERE id = ?').run(hashPassword(new_password), reset.driver_id);
    db.prepare('UPDATE password_resets SET used_at = datetime(\'now\') WHERE id = ?').run(reset.id);
  });
  run();

  res.json({ status: 'ok' });
});

// A driver's own parking history - only sessions that were tagged with
// their account at entry time (anonymous scans before/without login aren't
// retroactively linked).
router.get('/me/sessions', requireAuth, requireRole('driver'), (req, res) => {
  const sessions = db
    .prepare(
      `SELECT se.*, s.code AS spot_code FROM sessions se
       JOIN spots s ON s.id = se.spot_id
       WHERE se.driver_id = ?
       ORDER BY se.entry_time DESC
       LIMIT 100`
    )
    .all(req.user.sub);
  res.json({ sessions });
});

module.exports = router;
