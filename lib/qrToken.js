const crypto = require('crypto');
const { getConfig } = require('../db');

// There is now exactly ONE QR code for the whole lot, printed at the
// entrance - it just proves "this scan came from our real signage", not
// which spot (the driver picks that after logging in). Same HMAC pattern as
// before, signed over a fixed constant instead of a per-spot code.
const ENTRY_SUBJECT = 'LOT_ENTRY';

function signEntryToken() {
  const secret = getConfig('qr_secret');
  return crypto.createHmac('sha256', secret).update(ENTRY_SUBJECT).digest('hex').slice(0, 24);
}

function verifyEntryToken(token) {
  if (!token) return false;
  const expected = signEntryToken();
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { signEntryToken, verifyEntryToken };
