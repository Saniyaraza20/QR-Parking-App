const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db } = require('./index');
const { hashPassword } = require('../lib/auth');

const SPOT_COUNT = process.argv[2] ? parseInt(process.argv[2], 10) : 12;
const insert = db.prepare('INSERT OR IGNORE INTO spots (code, label) VALUES (?, ?)');

// Seed one staff login so the dashboard is usable out of the box.
//
// The temp password is NEVER printed to the console or written into any
// source file - console/CI output ends up in scrollback, log aggregators,
// and (as happened earlier in this project's own chat history) pasted
// straight into a conversation. Instead it's written to a single local file
// that is .gitignore'd, and the account is flagged must_change_password so
// the temp value stops working the moment it's used once.
const CRED_FILE = path.join(__dirname, '..', 'ADMIN_CREDENTIALS.local.txt');

const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existingUser) {
  const password = crypto.randomBytes(9).toString('base64url');
  db.prepare(
    'INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, ?, 1)'
  ).run('admin', hashPassword(password), 'manager');

  fs.writeFileSync(
    CRED_FILE,
    [
      'One-time staff login - delete this file after you have signed in once.',
      'You will be forced to set your own password on first login.',
      '',
      'username: admin',
      `password: ${password}`,
    ].join('\n'),
    { mode: 0o600 }
  );

  console.log('--------------------------------------------------------');
  console.log('Created a temporary staff login.');
  console.log(`Credentials written to: ${CRED_FILE}`);
  console.log('(git-ignored - open that file locally, never share it, delete it after first login)');
  console.log('--------------------------------------------------------');
} else {
  console.log('Staff user "admin" already exists, skipping.');
}

const rows = [];
for (let i = 1; i <= SPOT_COUNT; i++) {
  const code = `A-${String(i).padStart(2, '0')}`;
  rows.push([code, `Spot ${code}`]);
}

const insertMany = db.transaction((items) => {
  for (const [code, label] of items) insert.run(code, label);
});
insertMany(rows);

console.log(`Seeded ${SPOT_COUNT} spots (A-01 .. A-${String(SPOT_COUNT).padStart(2, '0')}).`);
console.log('Run "npm start" then visit /admin/qrcodes to see printable QR codes.');
