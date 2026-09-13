// Run with: npm run reset-password -- <username>
// For when you're locked out entirely and can't reach the in-app manager
// reset flow (e.g. it's the only manager account, or nobody remembers any
// password). Talks straight to the SQLite file, same as db/seed.js.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db } = require('./index');
const { hashPassword } = require('../lib/auth');

const username = process.argv[2];
if (!username) {
  console.error('Usage: npm run reset-password -- <username>');
  process.exit(1);
}

const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
if (!user) {
  console.error(`No staff account found with username "${username}".`);
  process.exit(1);
}

// Same discipline as the seed script: never print the password, write it to
// a single git-ignored local file instead, and force it to be changed on
// next login so this temp value stops working the moment it's used once.
const password = crypto.randomBytes(9).toString('base64url');
db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, active = 1 WHERE id = ?').run(
  hashPassword(password),
  user.id
);

const CRED_FILE = path.join(__dirname, '..', 'ADMIN_CREDENTIALS.local.txt');
fs.writeFileSync(
  CRED_FILE,
  [
    'Password reset via `npm run reset-password` - delete this file after you sign in.',
    'You will be forced to set a new password on next login.',
    '',
    `username: ${username}`,
    `password: ${password}`,
  ].join('\n'),
  { mode: 0o600 }
);

console.log('--------------------------------------------------------');
console.log(`Password reset for "${username}".`);
console.log(`New temp credentials written to: ${CRED_FILE}`);
console.log('(git-ignored - open that file locally, never share it, delete it after login)');
console.log('--------------------------------------------------------');
