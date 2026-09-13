const express = require('express');
const QRCode = require('qrcode');
const { db, getConfig, setConfig } = require('../db');
const { signEntryToken } = require('../lib/qrToken');
const { requireRole } = require('../lib/auth');

const router = express.Router();

// Live view of every spot, its active session, and who/what's parked there
router.get('/overview', (req, res) => {
  const spots = db
    .prepare(
      `SELECT s.*,
        se.id AS session_id, se.entry_time AS session_entry_time,
        se.expected_exit_time, se.vehicle_number, se.driver_name
       FROM spots s
       LEFT JOIN sessions se ON se.spot_id = s.id AND se.status = 'active'
       ORDER BY s.code`
    )
    .all();
  res.json({ spots, flat_fee_cents: Number(getConfig('flat_fee_cents', 5000)) });
});

// Manager-only: add a new physical spot
router.post('/spots', requireRole('manager'), (req, res) => {
  const { code, label } = req.body || {};
  if (!code || !/^[A-Z0-9\-]{1,10}$/i.test(code)) {
    return res.status(400).json({ error: 'Spot code must be 1-10 characters: letters, numbers, dashes' });
  }
  const existing = db.prepare('SELECT id FROM spots WHERE code = ?').get(code.toUpperCase());
  if (existing) return res.status(409).json({ error: 'A spot with that code already exists' });

  const info = db
    .prepare('INSERT INTO spots (code, label) VALUES (?, ?)')
    .run(code.toUpperCase(), label?.trim() || `Spot ${code.toUpperCase()}`);
  res.status(201).json({ id: info.lastInsertRowid, code: code.toUpperCase() });
});

// Full transaction history (not just today), with optional filters -
// capped at 300 rows to keep this simple/fast for an MVP; a real reporting
// view would paginate properly.
router.get('/sessions', (req, res) => {
  const { status, from, to } = req.query;
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push('se.status = ?');
    params.push(status);
  }
  if (from) {
    clauses.push("date(se.entry_time) >= date(?)");
    params.push(from);
  }
  if (to) {
    clauses.push("date(se.entry_time) <= date(?)");
    params.push(to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT se.*, s.code AS spot_code FROM sessions se
       JOIN spots s ON s.id = se.spot_id
       ${where}
       ORDER BY se.entry_time DESC
       LIMIT 300`
    )
    .all(...params);
  const revenue = rows.filter((r) => r.payment_status === 'paid').reduce((sum, r) => sum + (r.fee_cents || 0), 0);
  res.json({ sessions: rows, revenue_cents: revenue });
});

// Completed + active + failed sessions today, with revenue
router.get('/sessions/today', (req, res) => {
  const rows = db
    .prepare(
      `SELECT se.*, s.code AS spot_code FROM sessions se
       JOIN spots s ON s.id = se.spot_id
       WHERE date(se.entry_time) = date('now')
       ORDER BY se.entry_time DESC`
    )
    .all();
  const revenue = rows
    .filter((r) => r.payment_status === 'paid')
    .reduce((sum, r) => sum + (r.fee_cents || 0), 0);
  res.json({ sessions: rows, revenue_cents: revenue });
});

// Manual override: staff force-closes an active (or stuck pending_payment) session
router.post('/spots/:id/force-close', (req, res) => {
  const spot = db.prepare('SELECT * FROM spots WHERE id = ?').get(req.params.id);
  if (!spot) return res.status(404).json({ error: 'Spot not found' });
  const session = db
    .prepare("SELECT * FROM sessions WHERE spot_id = ? AND status IN ('active','pending_payment')")
    .get(spot.id);
  if (!session) return res.status(409).json({ error: 'No active or pending session on this spot' });

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE sessions SET exit_time = datetime('now'), status = 'force_closed', closed_by = 'staff' WHERE id = ?`
    ).run(session.id);
    db.prepare("UPDATE spots SET status = 'available' WHERE id = ?").run(spot.id);
  });
  run();
  res.json({ status: 'closed' });
});

// Toggle a spot disabled/available (e.g. maintenance, reserved for towing)
router.post('/spots/:id/toggle-disabled', (req, res) => {
  const spot = db.prepare('SELECT * FROM spots WHERE id = ?').get(req.params.id);
  if (!spot) return res.status(404).json({ error: 'Spot not found' });
  if (spot.status === 'occupied') {
    return res.status(409).json({ error: 'Cannot disable an occupied spot' });
  }
  const next = spot.status === 'disabled' ? 'available' : 'disabled';
  db.prepare('UPDATE spots SET status = ? WHERE id = ?').run(next, spot.id);
  res.json({ status: next });
});

router.post('/config/flat-fee', requireRole('manager'), (req, res) => {
  const { flat_fee_cents } = req.body;
  if (!flat_fee_cents || flat_fee_cents < 0) {
    return res.status(400).json({ error: 'Invalid fee' });
  }
  setConfig('flat_fee_cents', flat_fee_cents);
  res.json({ status: 'updated', flat_fee_cents });
});

// JSON version of the QR code, under /api/staff so it's covered by the same
// proxying (dev server, production, anything in front of the app) as every
// other staff call - the separate print page below is a plain server route
// and needs its own proxy rule in dev (see client/vite.config.js), which is
// easy to forget. Rendering the QR inline in the React app via this endpoint
// avoids that whole class of bug.
router.get('/qrcode', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const token = signEntryToken();
  QRCode.toDataURL(`${base}/entry?token=${token}`, { margin: 1, width: 320 }, (err, dataUrl) => {
    if (err) return res.status(500).json({ error: 'Failed to generate QR code' });
    res.json({ dataUrl });
  });
});

// The single printable QR code for the lot entrance (screen-safe & print-safe)
router.get('/qrcode.html', async (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const token = signEntryToken();
  const url = `${base}/entry?token=${token}`;
  const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320 });
  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <title>Lot entrance QR code</title>
    <style>
      body{font-family:sans-serif;background:#fff;color:#111;margin:24px;text-align:center}
      .card{display:inline-block;border:1px dashed #999;border-radius:12px;padding:24px;margin-top:24px}
      img{width:320px;height:320px}
      .label{margin-top:12px;font-weight:600;font-size:18px}
    </style></head>
    <body><h1>Lot entrance QR code</h1>
    <p>Print this once and post it at the lot entrance. Every driver scans this same code.</p>
    <div class="card"><img src="${dataUrl}" alt="Lot entrance QR"><div class="label">Scan to park</div></div>
    </body></html>`);
});

module.exports = router;
