const { OAuth2Client } = require('google-auth-library');
const { db } = require('../db');
const { hashPassword } = require('./auth');
const crypto = require('crypto');

// Real Google sign-in requires a GOOGLE_CLIENT_ID from the Google Cloud
// Console - there's nothing to mock here the way payments/email are mocked
// elsewhere, because the whole point is a cryptographic handshake with
// Google's own servers. Without this env var set, the feature reports
// itself as unavailable rather than pretending to work.
function isGoogleConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID;
}

// Verifies a real Google-issued ID token. This makes a network call to
// Google to fetch their current signing certs - it cannot be exercised in a
// sandboxed environment with no outbound access to accounts.google.com, so
// this function itself is intentionally a thin, obviously-correct wrapper
// around the official library. findOrCreateGoogleDriver below (the actual
// account logic) is where the real complexity lives, and IS unit-testable
// without a live Google connection - see its usage in tests.
async function verifyGoogleIdToken(idToken) {
  if (!isGoogleConfigured()) {
    const err = new Error('Google sign-in is not configured on this server');
    err.code = 'GOOGLE_NOT_CONFIGURED';
    throw err;
  }
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
  return ticket.getPayload(); // { sub, email, email_verified, name, ... }
}

// Given an ALREADY-VERIFIED Google payload, find the matching driver account
// or create one. Separated from verifyGoogleIdToken specifically so this can
// be unit-tested with a fake payload object, without needing a real Google
// ID token or network access.
function findOrCreateGoogleDriver(payload) {
  if (!payload.email_verified) {
    const err = new Error('Google account email is not verified');
    err.code = 'EMAIL_NOT_VERIFIED';
    throw err;
  }

  const bySub = db.prepare('SELECT * FROM drivers WHERE google_sub = ?').get(payload.sub);
  if (bySub) return bySub;

  const email = payload.email.toLowerCase();
  const byEmail = db.prepare('SELECT * FROM drivers WHERE email = ?').get(email);
  if (byEmail) {
    // Existing password-based account signing in with Google for the first
    // time - link it by google_sub rather than creating a duplicate.
    db.prepare('UPDATE drivers SET google_sub = ? WHERE id = ?').run(payload.sub, byEmail.id);
    return { ...byEmail, google_sub: payload.sub };
  }

  // Brand new account. There's no password to set - it's a random,
  // never-shown value, since this account can only ever sign in via Google.
  const unusablePassword = crypto.randomBytes(24).toString('hex');
  const info = db
    .prepare('INSERT INTO drivers (name, email, password_hash, google_sub) VALUES (?, ?, ?, ?)')
    .run(payload.name || email, email, hashPassword(unusablePassword), payload.sub);
  return db.prepare('SELECT * FROM drivers WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = { isGoogleConfigured, verifyGoogleIdToken, findOrCreateGoogleDriver };
