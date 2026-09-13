const STAFF_TOKEN_KEY = 'parking_staff_token';
const DRIVER_TOKEN_KEY = 'parking_driver_token';

// Two completely separate token namespaces - a person could in principle be
// both a staff member and a registered driver, and either way a staff token
// must never be usable as a driver token or vice versa (the server enforces
// this by role too - this is just so the two logged-in states don't collide
// in the browser).
export function getToken() { return localStorage.getItem(STAFF_TOKEN_KEY); }
export function setToken(token) { localStorage.setItem(STAFF_TOKEN_KEY, token); }
export function clearToken() { localStorage.removeItem(STAFF_TOKEN_KEY); }

export function getDriverToken() { return localStorage.getItem(DRIVER_TOKEN_KEY); }
export function setDriverToken(token) { localStorage.setItem(DRIVER_TOKEN_KEY, token); }
export function clearDriverToken() { localStorage.removeItem(DRIVER_TOKEN_KEY); }

// Note on storing JWTs in localStorage: simplest option for an MVP, but it
// is readable by any JS on the page, so it's vulnerable if the app ever picks
// up an XSS bug. Before a real production rollout, move to httpOnly cookies
// issued by the server instead - see the README for the tradeoff.

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

let onMustChangePassword = () => {};
export function setMustChangePasswordHandler(fn) { onMustChangePassword = fn; }

let onDriverUnauthorized = () => {};
export function setDriverUnauthorizedHandler(fn) { onDriverUnauthorized = fn; }

// Reads role/identity out of a JWT payload for DISPLAY purposes only - this
// is NOT a security check (the server enforces that on every request), just
// so the UI can decide what to show.
function decodeToken(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { username: payload.username, email: payload.email, role: payload.role, sub: payload.sub };
  } catch {
    return null;
  }
}
export function getUserFromToken() { return decodeToken(getToken()); }
export function getDriverFromToken() { return decodeToken(getDriverToken()); }

// True if the token is missing or its `exp` claim is in the past. Used by
// route guards to redirect to login BEFORE rendering a page that would
// immediately 401 - avoids the "content flashes then vanishes" effect that
// looks like the page is broken.
function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return false;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}
export function isDriverTokenValid() { return !isTokenExpired(getDriverToken()); }
export function isStaffTokenValid() { return !isTokenExpired(getToken()); }

// authType: false (public), 'staff', or 'driver' - picks which token (if
// any) gets attached as Authorization: Bearer, and which 401 handler fires.
async function request(path, { method = 'GET', body, authType = false, guestToken = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authType === 'staff') {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (authType === 'driver') {
    const token = getDriverToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  // Guest bookings (skip-login) prove ownership of their own session with a
  // one-time token instead of a JWT. If the driver happens to also be logged
  // in, their JWT above takes precedence server-side; the guest token is a
  // harmless extra.
  if (guestToken) headers['x-guest-token'] = guestToken;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && authType === 'staff') {
    clearToken();
    onUnauthorized();
  }
  if (res.status === 401 && authType === 'driver') {
    clearDriverToken();
    onDriverUnauthorized();
  }
  if (res.status === 403 && authType === 'staff') {
    const data = await res.clone().json().catch(() => ({}));
    if (data.code === 'MUST_CHANGE_PASSWORD') onMustChangePassword();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // Public: what the QR at the lot entrance links to
  entryLink: () => request('/api/parking/entry-link'),
  getPublicQr: () => request('/api/parking/qrcode'),
  verifyEntry: (token) => request(`/api/parking/entry-info?token=${encodeURIComponent(token)}`),

  // Reservation flow - works for both logged-in drivers and guests.
  // Guest calls pass a guestToken (minted at reserve time) to prove ownership.
  listSpots: () => request('/api/parking/spots'),
  reserveSpot: (payload) => request('/api/parking/reserve', { method: 'POST', authType: 'driver', body: payload }),
  getBooking: (sessionId, guestToken) => request(`/api/parking/sessions/${sessionId}`, { authType: 'driver', guestToken }),
  getInvoice: (sessionId, guestToken) => request(`/api/parking/sessions/${sessionId}/invoice`, { authType: 'driver', guestToken }),

  createPaymentIntent: (sessionId, guestToken) =>
    request(`/api/sessions/${sessionId}/payment-intent`, { method: 'POST', authType: 'driver', guestToken }),
  devSimulatePayment: (paymentId) => request(`/api/payments/dev-simulate/${paymentId}`, { method: 'POST' }),

  // Staff auth
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/change-password', {
      method: 'POST',
      authType: 'staff',
      body: { current_password: currentPassword, new_password: newPassword },
    }),

  // Staff dashboard
  overview: () => request('/api/staff/overview', { authType: 'staff' }),
  sessionsToday: () => request('/api/staff/sessions/today', { authType: 'staff' }),
  forceClose: (spotId) => request(`/api/staff/spots/${spotId}/force-close`, { method: 'POST', authType: 'staff' }),
  toggleDisabled: (spotId) => request(`/api/staff/spots/${spotId}/toggle-disabled`, { method: 'POST', authType: 'staff' }),

  // Manager-only: staff account management
  listUsers: () => request('/api/staff/users', { authType: 'staff' }),
  createUser: (username, role) => request('/api/staff/users', { method: 'POST', authType: 'staff', body: { username, role } }),
  deactivateUser: (id) => request(`/api/staff/users/${id}/deactivate`, { method: 'POST', authType: 'staff' }),
  reactivateUser: (id) => request(`/api/staff/users/${id}/reactivate`, { method: 'POST', authType: 'staff' }),

  // Driver accounts (self-service)
  registerDriver: (name, email, password) =>
    request('/api/drivers/register', { method: 'POST', body: { name, email, password } }),
  loginDriver: (email, password) => request('/api/drivers/login', { method: 'POST', body: { email, password } }),
  driverMe: () => request('/api/drivers/me', { authType: 'driver' }),
  driverSessions: () => request('/api/drivers/me/sessions', { authType: 'driver' }),
  googleOAuthConfig: () => request('/api/drivers/oauth/google/config'),
  loginWithGoogle: (idToken) => request('/api/drivers/oauth/google', { method: 'POST', body: { id_token: idToken } }),
  forgotPassword: (email) => request('/api/drivers/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token, newPassword) =>
    request('/api/drivers/reset-password', { method: 'POST', body: { token, new_password: newPassword } }),

  // Staff: QR, spot management, full transaction history
  getQrCode: () => request('/api/staff/qrcode', { authType: 'staff' }),
  createSpot: (code, label) => request('/api/staff/spots', { method: 'POST', authType: 'staff', body: { code, label } }),
  listAllSessions: (filters = {}) => {
    const qs = new URLSearchParams(filters).toString();
    return request(`/api/staff/sessions${qs ? `?${qs}` : ''}`, { authType: 'staff' });
  },
  resetStaffPassword: (id) => request(`/api/staff/users/${id}/reset-password`, { method: 'POST', authType: 'staff' }),
};
