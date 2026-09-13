const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'parking.sqlite3');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS spots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,      -- e.g. "A-12"
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','disabled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    google_sub TEXT UNIQUE, -- Google's stable per-account ID, set only for Google sign-ins
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A session now represents one prepaid reservation, not a time-billed stay.
  -- Lifecycle: pending_payment -> active -> completed (auto-expired or force-closed)
  --                            \-> payment_failed (spot released, nothing charged)
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spot_id INTEGER NOT NULL REFERENCES spots(id),
    driver_id INTEGER REFERENCES drivers(id), -- NULL for guest (skip-login) bookings
    guest_token_hash TEXT,          -- for guest bookings: sha256 of the token only that guest holds
    driver_name TEXT NOT NULL,     -- as entered for THIS booking (may differ from account name)
    driver_email TEXT NOT NULL,    -- where the invoice is sent
    vehicle_number TEXT NOT NULL,
    entry_time TEXT NOT NULL DEFAULT (datetime('now')),
    expected_exit_time TEXT,       -- entry_time + session_duration_hours, set once payment succeeds
    exit_time TEXT,
    duration_minutes INTEGER,
    fee_cents INTEGER NOT NULL,    -- always the flat fee at time of booking (paise, since currency is INR)
    status TEXT NOT NULL DEFAULT 'pending_payment'
      CHECK (status IN ('pending_payment','active','completed','payment_failed','force_closed')),
    payment_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (payment_status IN ('pending','paid','failed')),
    closed_by TEXT CHECK (closed_by IN ('auto_expired','staff'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
    provider_ref TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER UNIQUE NOT NULL REFERENCES sessions(id),
    email TEXT NOT NULL,
    html TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff','manager')),
    must_change_password INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scan_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spot_id INTEGER REFERENCES spots(id),
    session_id INTEGER REFERENCES sessions(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('entry_qr_verified','entry_qr_rejected','reserved','reservation_failed')),
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_spot ON sessions(spot_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_driver ON sessions(driver_id);
`);

function getConfig(key, fallback) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setConfig(key, value) {
  db.prepare(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// Seed sane defaults on first run
if (!getConfig('flat_fee_cents')) setConfig('flat_fee_cents', 5000); // paise -> Rs. 50.00 flat, per booking
if (!getConfig('session_duration_hours')) setConfig('session_duration_hours', 4); // how long a paid slot is held
if (!getConfig('reservation_hold_minutes')) setConfig('reservation_hold_minutes', 10); // must pay within this window or the spot releases
if (!getConfig('qr_secret')) setConfig('qr_secret', require('crypto').randomBytes(24).toString('hex'));

// In production these belong in environment variables / a secrets manager, not the DB.
// Kept here (same as qr_secret) to match the rest of this MVP's config pattern - see README.
if (!getConfig('jwt_secret')) setConfig('jwt_secret', require('crypto').randomBytes(32).toString('hex'));
if (!getConfig('webhook_secret')) setConfig('webhook_secret', require('crypto').randomBytes(32).toString('hex'));

module.exports = { db, getConfig, setConfig };
