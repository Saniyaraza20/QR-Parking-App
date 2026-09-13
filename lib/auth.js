const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getConfig } = require('../db');

const TOKEN_TTL = '8h';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

// Generic across staff (username) and driver (email) accounts - whichever
// identifier the caller passes through shows up in the token.
function signToken({ id, role, username, email, must_change_password }) {
  const secret = getConfig('jwt_secret');
  return jwt.sign(
    {
      sub: id,
      role,
      ...(username ? { username } : {}),
      ...(email ? { email } : {}),
      mustChangePassword: !!must_change_password,
    },
    secret,
    { expiresIn: TOKEN_TTL }
  );
}

function verifyTokenString(token) {
  const secret = getConfig('jwt_secret');
  return jwt.verify(token, secret); // throws if invalid/expired
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  return bearer || req.query.token || null;
}

// Accepts the token from either an Authorization header (normal fetch/XHR calls)
// or a `token` query param (needed for plain browser navigations, e.g. the
// printable QR sheet, where you can't attach a custom header).
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  try {
    req.user = verifyTokenString(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Like requireAuth, but never rejects the request - it just attaches req.user
// if a valid token happens to be present. Used on the public scan endpoint:
// a driver's app being logged in should let us tag the session with their
// account, but a driver NOT being logged in (or having a stale token) must
// never block them from actually parking. Entry/exit always has to work.
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyTokenString(token);
    } catch {
      // ignored on purpose - fall through as anonymous
    }
  }
  next();
}

// Blocks access to real staff functionality until a temp/seeded password has
// been changed. This runs server-side (not just a frontend redirect) because
// a client can't be trusted to honor a UI-only redirect - someone could keep
// using the temp-password token against the API directly.
function requirePasswordChanged(req, res, next) {
  if (req.user && req.user.mustChangePassword) {
    return res.status(403).json({ error: 'Password change required before continuing', code: 'MUST_CHANGE_PASSWORD' });
  }
  next();
}

// Restricts a route to one or more roles. Accepts a single role string or an
// array. Used both to separate staff/manager permissions from each other,
// and - just as importantly - to keep driver accounts and staff accounts out
// of each other's routes entirely, even though both are just "a valid JWT".
function requireRole(roleOrRoles) {
  const allowed = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${allowed.join(' or ')}` });
    }
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyTokenString,
  requireAuth,
  optionalAuth,
  requirePasswordChanged,
  requireRole,
};
