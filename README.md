# QR parking management system (single lot)

A working prototype of a QR-code-based parking system, built around one
printed QR code at the lot entrance. A driver scans it, logs in (or creates
an account), enters their vehicle details, sees a 3D confirmation of their
plate number, picks an open spot from a live map, pays a flat fee, and gets
allotted that spot — with an invoice generated automatically. Staff get a
live dashboard; managers can create/manage staff logins.

## Quick start

```bash
# 1. Backend
npm install
npm run seed        # creates 12 spots + one temp staff login
cat ADMIN_CREDENTIALS.local.txt   # read the temp password locally - never share/paste it
npm start            # http://localhost:3000

# 2. Frontend (separate terminal, for local dev with hot reload)
cd client
npm install
npm run dev           # http://localhost:5173, proxies /api to :3000
```

For a production-style single-server setup, build the React app and let Express
serve it directly:

```bash
cd client && npm run build && cd ..
npm start             # now serves the built React app from client/dist
```

**Optional: Google sign-in.** The app works fully without this. To enable the
"Sign in with Google" button, get a client ID from the Google Cloud Console
(OAuth consent screen + Web application credentials) and set it before
starting the backend:

```bash
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
npm start
```

`GET /api/drivers/oauth/google/config` reports whether it's enabled - the
frontend checks this itself and simply doesn't render the button when it's not set.

Open `http://localhost:3000/` — there's a "Simulate scanning the entrance QR"
button on the home page standing in for an actual QR scan, since there's no
physical sign in this dev environment. Staff log in via the top nav; the
actual printable QR code for the lot entrance is at `/admin/qrcode` (staff-only).

## Bug fix: QR code "not visible" in dev mode

If you ran the two-terminal dev setup (`npm run dev` in `client/` alongside
`npm start` for the backend), clicking "Print entrance QR code" would fail
silently. Cause: Vite's dev server only proxied `/api/*` to the backend
(`client/vite.config.js`) - but the QR page lived at the top-level path
`/admin/qrcode`, which Vite didn't know about, so the browser hit Vite's own
server instead of Express and got nothing back. Fixed two ways:
- `vite.config.js` now also proxies `/admin` (fixes the direct symptom).
- The QR is also rendered **inline in the React app** via a new
  `GET /api/staff/qrcode` JSON endpoint (with a Download PNG button) - since
  it's under `/api`, it's covered by the existing proxy rule regardless, so
  this whole class of "forgot to proxy a path" bug can't recur for it. The
  original print-friendly `/admin/qrcode` page is still there for actually
  printing a physical sign.

## Password recovery

Two separate paths, matching who's locked out:

- **You're locked out of the only staff/manager account** (can't log in at
  all): `npm run reset-password -- <username>` talks directly to the SQLite
  file - same discipline as seeding: generates a random temp password,
  writes it to `ADMIN_CREDENTIALS.local.txt` (never printed to the console),
  forces a password change on next login.
- **A manager wants to reset a colleague's password** (while logged in):
  the "Reset password" button next to each user on `/staff/users` calls
  `POST /api/staff/users/:id/reset-password` - same temp-password pattern,
  shown once in the UI to the manager who requested it.
- **A driver forgot their password**: self-service via `/driver/forgot-password`.
  Since there's no real email provider (same situation as payments/invoices),
  the reset link is generated and appended to a single git-ignored local file,
  `PASSWORD_RESET_LINKS.local.txt`, standing in for "the email that would
  have been sent" - never printed to the console or returned in the API
  response (that would let anyone reset anyone's password just by knowing
  their email). Tokens are single-use, expire in 30 minutes, and the
  "email exists" response is identical whether or not the account exists,
  to prevent user enumeration.

## Google OAuth (driver sign-in)

`lib/googleAuth.js` verifies real Google ID tokens via the official
`google-auth-library`, and links or creates a driver account from the
verified payload. This is real, not mocked - but it needs a `GOOGLE_CLIENT_ID`
environment variable (from the Google Cloud Console) to do anything.
Without it, `GET /api/drivers/oauth/google/config` reports itself as
disabled and the "Sign in with Google" button simply doesn't render -
the app works fully on email/password alone either way.

Because the actual cryptographic handshake with Google's servers can't be
exercised in a network-sandboxed environment, the account-linking logic
(`findOrCreateGoogleDriver`) is deliberately split out from token
verification so it can be - and was - unit-tested directly with a fake,
already-verified payload: confirmed it creates new accounts, doesn't
duplicate on repeat sign-in, correctly links an existing password-based
account by email on first Google sign-in, and rejects unverified emails.

## Other gaps filled from the prompt-6 checklist

- **Occupancy %** added to the staff dashboard stats.
- **Add a spot** - manager-only form on the staff dashboard
  (`POST /api/staff/spots`); previously spots could only be created via
  `npm run seed`.
- **Full transactions page** (`/staff/transactions`) with status and date
  filters - the dashboard's "today's sessions" table was today-only.
- **Live countdown timer** on a driver's active booking in their history page.

## How the driver flow works

**Login is optional.** The landing page (`/`) shows the entrance QR code
front and center - scanning it with a phone (or tapping it) drops the user
straight into booking. Three ways to book:

- **Guest (no account):** the default. The driver types name, email, and
  vehicle number inline; the invoice goes to that email; no account is
  created. Their booking is protected by a one-time "guest token" minted at
  reservation and held only by their browser for the rest of the flow -
  so the booking and its invoice (which contain personal details) can't be
  read by anyone else, even though there's no login. Tested: a request
  without that token, or with a wrong one, gets `403`.
- **Logged-in driver:** name/email are prefilled, the booking links to their
  account and shows up in their history. Their JWT is the ownership proof, so
  no guest token is issued.
- **Log in / sign up mid-flow:** a banner on the details step offers this for
  guests who want their history saved, returning them to the same booking
  point afterward.

1. **Scan the single lot-entrance QR.** It's the same code for every spot -
   the driver picks which one once they're through the flow, they don't scan
   per-spot codes anymore.
2. **Log in or register.** Self-service, driver picks their own password.
3. **Enter name, email, and vehicle number.**
4. **3D confirmation.** A small Three.js scene renders a car with the entered
   plate number on it, so there's a clear visual double-check before booking -
   the plate number is also shown as plain text underneath.
5. **Pick a spot.** A live grid of every spot shows which are available vs
   already occupied (or disabled for maintenance) - picking an occupied one
   isn't possible.
6. **Pay a flat fee (₹50 by default, configurable).** There's no real payment
   provider wired up - it simulates a ~2 second processing delay, but still
   goes through the same signature-verified confirmation path a real
   provider's webhook would use (see "Payment" below).
7. **Allotted.** The driver sees their assigned spot, how long it's held for,
   and confirmation that an invoice was "emailed" (see "Invoice" below).
8. **The spot frees itself automatically** after the configured duration
   (4 hours by default) - there's no exit scan. A driver's booking is simply
   good for that window; a reconciliation job sweeps expired bookings every
   2 minutes.

If a driver reserves a spot but abandons the flow before paying, that
reservation (and the spot hold) is automatically released after a short
window (10 minutes by default) - the same reconciliation job handles this.

## Key design decisions

### QR token: one signed code for the whole lot
`lib/qrToken.js` signs a single constant (`LOT_ENTRY`) with HMAC-SHA256,
rather than one code per spot. This is what's printed at `/admin/qrcode`.
There's less to protect than the old per-spot model (there's nothing spot-
specific to spoof), but the same signature pattern is kept for consistency
and to make forged QR codes pointless.

### Reservation race safety
Two drivers tapping the same open spot at the same moment can't both win it -
`POST /api/parking/reserve` does the spot-availability check and the
`UPDATE spots SET status='occupied' WHERE status='available'` inside one
transaction, and checks `changes === 0` to detect a lost race. Verified with
a real concurrent-request test: two simultaneous reservations for the same
spot produced exactly one session and one `409`.

### Payment: still signature-verified, now prepaid
The payment-intent + signed-webhook pattern from earlier is unchanged in
spirit, just re-ordered: a spot is reserved (marked occupied, session status
`pending_payment`) *before* payment, and only a correctly-signed webhook
confirmation flips it to `active` and generates the invoice. An unsigned or
forged confirmation is rejected outright and never touches booking state -
and if payment fails, the spot is released back to `available` rather than
staying stuck occupied. `POST /api/sessions/:id/payment-intent` also now
requires the requesting driver to actually own that session (`403` otherwise).

There's still no real Stripe/Razorpay account - `POST /api/payments/dev-simulate/:paymentId`
stands in for the provider's webhook call, building the same signed payload a
real provider would send and posting it through the real verification path.
Remove that route once a real provider is integrated.

### Invoice: generated for real, "sent" is mocked
`lib/invoice.js` builds actual invoice HTML with the booking details and
plate number - there's no real email provider wired up, so instead of
pretending to send it, it's stored (`invoices` table) and viewable at
`GET /api/parking/sessions/:id/invoice`. Swapping in SES/SendGrid later means
dispatching this same HTML, not changing what it contains.

### Auto-expiry replaces time-based billing
The fee is now flat and paid upfront, so there's no more "scan to end your
session and get billed for elapsed time." A booking is simply valid for a
fixed window (`session_duration_hours`, default 4h) and a reconciliation
sweep auto-releases the spot once that's up - verified by backdating a
session's `expected_exit_time` and confirming the spot returns to `available`.

### Staff auth, rate limiting, driver accounts, RBAC
All still in place from earlier iterations - JWT-protected staff routes with
role checks (`staff` vs `manager`), rate limiting on login/registration/
reservation endpoints, self-service driver accounts kept in a completely
separate token namespace from staff accounts (verified in both directions: a
driver token gets `403` on staff routes and a staff token gets `403` on
driver routes), manager-only staff account creation with forced password
changes on first login, and no secret or password ever hardcoded or printed
to logs (seeded credentials go to a git-ignored local file instead).

## Project structure

```
server.js                Express app, rate limiters, auth wiring, reconciliation job
db/index.js                SQLite schema
db/seed.js                  Seeds spots + one temp staff login
db/reset-password.js       CLI: reset a staff login directly against the DB
lib/qrToken.js             HMAC sign/verify for the single lot-entrance token
lib/auth.js                 Password hashing, JWT, requireAuth/requireRole/optionalAuth
lib/googleAuth.js          Google ID token verification + account linking
lib/paymentWebhook.js      Signature verification + session activation + invoice trigger
lib/invoice.js              Builds invoice HTML
routes/parking.js          Entry verification, spot listing, reserve, booking status, invoice
routes/staff.js              Dashboard API, spot creation, transactions, entrance QR
routes/payments.js         Payment intent + webhook + dev-only simulator
routes/auth.js                Staff login, change-password
routes/users.js               Manager-only staff account create/list/deactivate/reset
routes/drivers.js           Driver register/login/history, Google OAuth, forgot/reset password
client/src/pages/EntryFlow.jsx         The full driver wizard
client/src/components/CarPlateOverlay.jsx   Three.js 3D car + plate confirmation
client/src/components/GoogleSignInButton.jsx  Renders only if Google OAuth is configured
client/src/pages/StaffDashboard.jsx      Live spots, inline QR, add-spot, occupancy %
client/src/pages/Transactions.jsx        Full filterable transaction history
client/src/pages/ManageStaff.jsx         Manager-only staff account management + reset
client/src/pages/Driver*.jsx              Driver register/login/history/forgot/reset password
```

## Still open (next layer of hardening)

- **httpOnly cookie instead of localStorage** for both staff and driver JWTs.
- **Real payment provider** (Stripe/Razorpay) in place of the dev-simulate route.
- **Real email delivery** (SES/SendGrid) in place of the stored-invoice mock.
- **Secrets out of the DB**: `qr_secret`, `jwt_secret`, and `webhook_secret`
  still live in the `config` table for consistency with the rest of this
  MVP's pattern - move to environment variables / a secrets manager before
  this touches a real lot.
- **HTTPS**: terminate TLS at a reverse proxy or hosting platform.
- **Bundle size**: adding Three.js pushed the client bundle to ~180KB
  gzipped. Fine for a demo; worth code-splitting `CarPlateOverlay` with a
  dynamic `import()` before this ships broadly, since most routes don't need it.
- **Multi-lot / multi-tenant support**: this schema assumes a single lot -
  scaling out mainly means adding a `lots` table and scoping `spots` to it.
