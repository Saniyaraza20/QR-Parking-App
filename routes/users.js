const express = require('express');
const crypto = require('crypto');
const { db } = require('../db');
const { hashPassword, requireRole } = require('../lib/auth');

const router = express.Router();

// Every route here additionally requires the 'manager' role - mounted with
// requireRole('manager') in server.js, on top of the requireAuth +
// requirePasswordChanged already applied to all of /api/staff/*.

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;

// List staff logins (never returns password_hash)
router.get('/', (req, res) => {
  const users = db
    .prepare(
      `SELECT id, username, role, active, must_change_password, created_at
       FROM users ORDER BY created_at DESC`
    )
    .all();
  res.json({ users: users.map((u) => ({ ...u, active: !!u.active, must_change_password: !!u.must_change_password })) });
});

// Create a new staff/manager login. Always starts with a random temp
// password and must_change_password=1 - there is no way to set someone
// else's real password directly, by design.
router.post('/', (req, res) => {
  const { username, role } = req.body || {};

  if (!username || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, dot, dash, underscore' });
  }
  if (!['staff', 'manager'].includes(role)) {
    return res.status(400).json({ error: "role must be 'staff' or 'manager'" });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'That username is already taken' });

  const tempPassword = crypto.randomBytes(9).toString('base64url');
  const info = db
    .prepare(
      'INSERT INTO users (username, password_hash, role, must_change_password, active) VALUES (?, ?, ?, 1, 1)'
    )
    .run(username, hashPassword(tempPassword), role);

  // Returning the temp password here is intentional and safe: this response
  // goes only to the authenticated manager who just requested the account,
  // over the same channel as every other API call - not printed to a log,
  // not written to a file, not visible to anyone else. The account is
  // forced to change it before it can be used for anything (see
  // requirePasswordChanged). Whoever receives this from the manager should
  // treat it as single-use and change it immediately on first login.
  res.status(201).json({
    id: info.lastInsertRowid,
    username,
    role,
    temp_password: tempPassword,
  });
});

// Manager resets ANOTHER staff member's password (e.g. they're locked out
// and can't use the self-service change-password flow because they can't
// log in at all). Same pattern as account creation: random temp password,
// forced change on next login, returned once to the requesting manager.
router.post('/:id/reset-password', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const tempPassword = crypto.randomBytes(9).toString('base64url');
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(
    hashPassword(tempPassword),
    target.id
  );

  res.json({ username: target.username, temp_password: tempPassword });
});

router.post('/:id/deactivate', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.sub) {
    return res.status(400).json({ error: "You can't deactivate your own account" });
  }
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(target.id);
  res.json({ status: 'deactivated' });
});

router.post('/:id/reactivate', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET active = 1 WHERE id = ?').run(target.id);
  res.json({ status: 'reactivated' });
});

module.exports = router;
