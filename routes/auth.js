const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { verifyPassword, signToken } = require('../lib/auth');

const router = express.Router();

// Brute-force protection: 5 attempts per IP per 15 minutes on the login route.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // Same error for "no such user", "wrong password", and "deactivated account" -
  // don't give an attacker a way to enumerate which usernames exist or are active.
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      must_change_password: !!user.must_change_password,
    },
  });
});

router.post('/change-password', loginLimiter, (req, res) => {
  const { requireAuth, verifyPassword, hashPassword } = require('../lib/auth');
  requireAuth(req, res, () => {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
    if (!user || !verifyPassword(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
      hashPassword(new_password),
      user.id
    );

    // Issue a fresh token reflecting must_change_password = false, so the
    // client doesn't need to log in again.
    const token = signToken({ ...user, must_change_password: 0 });
    res.json({ status: 'updated', token });
  });
});

router.get('/me', (req, res) => {
  // Lightweight endpoint the React app can call on load to check "am I still logged in".
  const { requireAuth } = require('../lib/auth');
  requireAuth(req, res, () => res.json({ user: req.user }));
});

module.exports = router;
