const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { db, getConfig } = require('./db');
const { requireAuth, requirePasswordChanged, requireRole } = require('./lib/auth');

const parkingRoutes = require('./routes/parking');
const staffRoutes = require('./routes/staff');
const paymentRoutes = require('./routes/payments');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const driverRoutes = require('./routes/drivers');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render's reverse proxy so express-rate-limit sees real client IPs
// instead of Render's internal proxy IP (which would make everyone share one bucket).
app.set('trust proxy', 1);

// Capture the exact raw bytes of the body as it arrives, so payment webhook
// signature verification checks the real payload, not a re-serialized copy.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Serve the built React app (see client/) instead of the old static HTML pages.
app.use(express.static(path.join(__dirname, 'client', 'dist')));

// The entry/reservation flow is the most exposed surface (anyone who scans
// the lot's QR reaches it before logging in), so it gets its own tighter limiter.
const parkingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests - slow down and try again.' },
});

// A gentler, general-purpose limiter for everything else under /api.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/parking', parkingLimiter, parkingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use(
  '/api/staff/users',
  requireAuth,
  requireRole(['staff', 'manager']),
  requirePasswordChanged,
  requireRole('manager'),
  usersRoutes
);
app.use(
  '/api/staff',
  requireAuth,
  requireRole(['staff', 'manager']),
  requirePasswordChanged,
  staffRoutes
);
app.use('/api', apiLimiter, paymentRoutes);

app.get('/healthz', (req, res) => res.json({ ok: true }));

// Convenience shortcut - the React dashboard links here with ?token=<jwt> attached,
// since a plain browser navigation can't send an Authorization header.
app.get('/admin/qrcode', (req, res) => {
  const qs = req.query.token ? `?token=${encodeURIComponent(req.query.token)}` : '';
  res.redirect('/api/staff/qrcode.html' + qs);
});

// Anything not matched above falls through to the React app's own router.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

function reconcile() {
  const holdMinutes = Number(getConfig('reservation_hold_minutes', 10));
  const abandoned = db
    .prepare(
      `SELECT * FROM sessions WHERE status = 'pending_payment' AND entry_time <= datetime('now', ?)`
    )
    .all(`-${holdMinutes} minutes`);
  for (const session of abandoned) {
    db.prepare("UPDATE sessions SET status = 'payment_failed', payment_status = 'failed' WHERE id = ?").run(session.id);
    db.prepare("UPDATE spots SET status = 'available' WHERE id = ?").run(session.spot_id);
    console.log(`[reconcile] released abandoned reservation, session ${session.id} spot ${session.spot_id}`);
  }

  const expired = db
    .prepare(`SELECT * FROM sessions WHERE status = 'active' AND expected_exit_time <= datetime('now')`)
    .all();
  for (const session of expired) {
    db.prepare(
      `UPDATE sessions SET exit_time = datetime('now'), status = 'completed', closed_by = 'auto_expired' WHERE id = ?`
    ).run(session.id);
    db.prepare("UPDATE spots SET status = 'available' WHERE id = ?").run(session.spot_id);
    console.log(`[reconcile] auto-expired session ${session.id}, spot ${session.spot_id} now free`);
  }
}
setInterval(reconcile, 2 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`QR parking app running at http://localhost:${PORT}`);
  console.log(`  React app (driver + staff):  http://localhost:${PORT}/`);
  console.log(`  Printable entrance QR:        http://localhost:${PORT}/admin/qrcode`);
});