import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getDriverToken, getDriverFromToken } from '../api';
import CarPlateOverlay from '../components/CarPlateOverlay';
import StepIndicator from '../components/StepIndicator';
import { useToast } from '../components/Toast';

function money(cents) {
  return '\u20b9' + (cents / 100).toFixed(2);
}

const STEPS = {
  VERIFYING: 'verifying',
  DETAILS: 'details',
  PLATE_CONFIRM: 'plate_confirm',
  PICK_SPOT: 'pick_spot',
  PAYING: 'paying',
  DONE: 'done',
};

// Visible progress for the driver - PLATE_CONFIRM is folded into "Confirm
// vehicle" since the 3D overlay is a sub-step of it, not its own stage.
const WIZARD_STAGES = ['Details', 'Confirm vehicle', 'Pick a spot', 'Pay', 'Done'];
function stageIndexFor(step) {
  switch (step) {
    case STEPS.DETAILS: return 0;
    case STEPS.PLATE_CONFIRM: return 1;
    case STEPS.PICK_SPOT: return 2;
    case STEPS.PAYING: return 3;
    case STEPS.DONE: return 4;
    default: return 0;
  }
}

export default function EntryFlow() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const returnTo = `/entry?token=${token}`;
  const notify = useToast();

  const [step, setStep] = useState(STEPS.VERIFYING);
  const [error, setError] = useState(null);
  const [entryInfo, setEntryInfo] = useState(null);

  const driver = getDriverFromToken();
  const isLoggedIn = !!getDriverToken();
  const [name, setName] = useState(driver?.username || '');
  const [email, setEmail] = useState(driver?.email || '');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [spots, setSpots] = useState(null);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [booking, setBooking] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [guestToken, setGuestToken] = useState(null); // set when a guest (non-logged-in) reserves

  useEffect(() => {
    if (!token) {
      setError('Missing QR token - scan the code at the lot entrance.');
      return;
    }
    api
      .verifyEntry(token)
      .then((info) => {
        setEntryInfo(info);
        // No login gate anymore - everyone goes straight to the booking
        // details. A logged-in driver just gets their name/email prefilled;
        // a guest fills them in. Login/signup are offered as an option on
        // the details step, not required.
        setStep(STEPS.DETAILS);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (step === STEPS.DETAILS) {
      api.driverMe().then((d) => {
        setName((n) => n || d.driver.name);
        setEmail((e) => e || d.driver.email);
      }).catch(() => {});
    }
  }, [step]);

  function submitDetails(e) {
    e.preventDefault();
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!email.trim()) errs.email = 'Email is required';
    if (!vehicleNumber.trim()) errs.vehicle = 'Vehicle number is required';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setError(null);
    setStep(STEPS.PLATE_CONFIRM);
  }

  async function goToSpotPicker() {
    setError(null);
    try {
      const data = await api.listSpots();
      setSpots(data.spots);
      setStep(STEPS.PICK_SPOT);
    } catch (e) {
      setError(e.message);
    }
  }

  async function confirmAndPay() {
    if (!selectedSpot) return;
    setError(null);
    setStep(STEPS.PAYING);
    try {
      const reserveResp = await api.reserveSpot({
        spot_id: selectedSpot.id,
        name,
        email,
        vehicle_number: vehicleNumber,
        token,
      });
      const session = reserveResp.session;
      // A guest booking comes back with a one-time token that proves this
      // browser owns the session for the rest of the flow. A logged-in
      // driver's booking won't have one (their JWT is the proof instead).
      const gToken = reserveResp.guest_token || null;
      setGuestToken(gToken);

      const intent = await api.createPaymentIntent(session.id, gToken);
      await new Promise((resolve) => setTimeout(resolve, 2200));
      await api.devSimulatePayment(intent.payment_id);
      const final = await api.getBooking(session.id, gToken);
      setBooking(final.session);
      try {
        const inv = await api.getInvoice(session.id, gToken);
        setInvoice(inv.invoice);
      } catch {
        // invoice generation lands a beat after payment confirms - not fatal if it's not ready yet
      }
      notify(`You're parked in ${final.session.spot_code}!`, { type: 'success' });
      setStep(STEPS.DONE);
    } catch (e) {
      setError(e.message);
      notify('Booking failed - pick a spot and try again.', { type: 'error' });
      setStep(STEPS.PICK_SPOT);
    }
  }

  const showStepper = [STEPS.DETAILS, STEPS.PLATE_CONFIRM, STEPS.PICK_SPOT, STEPS.PAYING, STEPS.DONE].includes(step);

  return (
    <div className="page">
      <h1>Welcome - let's get you parked</h1>
      {showStepper && <StepIndicator steps={WIZARD_STAGES} currentIndex={stageIndexFor(step)} />}
      <div className="card">
        {error && <p className="error" role="alert">{error}</p>}

        {step === STEPS.VERIFYING && !error && (
          <>
            <div className="spinner" aria-hidden="true" />
            <p className="status" style={{ textAlign: 'center' }}>Checking QR code...</p>
          </>
        )}

        {step === STEPS.DETAILS && (
          <form onSubmit={submitDetails} noValidate>
            {!isLoggedIn && (
              <div style={{ background: 'var(--brand-light)', borderRadius: 8, padding: '10px 12px', marginBottom: 4 }}>
                <p className="status" style={{ margin: 0 }}>
                  Booking as a guest — no account needed.{' '}
                  <a href={`/driver/login?returnTo=${encodeURIComponent(returnTo)}`}>Log in</a>{' '}or{' '}
                  <a href={`/driver/register?returnTo=${encodeURIComponent(returnTo)}`}>sign up</a>{' '}
                  to save your parking history.
                </p>
              </div>
            )}
            <p className="status">Confirm your details for this booking.</p>
            <label htmlFor="name">Name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
              aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? 'name-err' : undefined} />
            {fieldErrors.name && <p className="field-error" id="name-err">{fieldErrors.name}</p>}

            <label htmlFor="email">Email (invoice sent here)</label>
            <input id="email" type="text" value={email} onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? 'email-err' : undefined} />
            {fieldErrors.email && <p className="field-error" id="email-err">{fieldErrors.email}</p>}

            <label htmlFor="vehicle">Vehicle number</label>
            <input id="vehicle" type="text" placeholder="e.g. MH12 AB 1234" value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)} style={{ textTransform: 'uppercase' }}
              aria-invalid={!!fieldErrors.vehicle} aria-describedby={fieldErrors.vehicle ? 'vehicle-err' : undefined} />
            {fieldErrors.vehicle && <p className="field-error" id="vehicle-err">{fieldErrors.vehicle}</p>}

            <button className="primary" type="submit">Continue</button>
          </form>
        )}

        {step === STEPS.PICK_SPOT && spots && (
          <>
            <p className="status">Pick an available spot ({money(entryInfo?.flat_fee_cents)} flat fee, held for {entryInfo?.session_duration_hours}h).</p>
            <div className="grid" role="group" aria-label="Available parking spots">
              {spots.map((s) => {
                const available = s.status === 'available';
                const selected = selectedSpot?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`spot-pick ${s.status} ${selected ? 'selected' : ''}`}
                    disabled={!available}
                    aria-pressed={selected}
                    aria-label={`Spot ${s.code}, ${s.status}${selected ? ', selected' : ''}`}
                    onClick={() => available && setSelectedSpot(s)}
                  >
                    <span className="code">{s.code}</span>
                    <span className="spot-state">
                      {available ? '\u25cf Available' : s.status === 'occupied' ? '\u25cf Occupied' : '\u25cf Disabled'}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="wizard-nav">
              <button className="secondary" onClick={() => setStep(STEPS.PLATE_CONFIRM)}>Back</button>
              <button className="primary" disabled={!selectedSpot} onClick={confirmAndPay}>
                {selectedSpot ? `Pay ${money(entryInfo?.flat_fee_cents)} for ${selectedSpot.code}` : 'Select a spot'}
              </button>
            </div>
          </>
        )}

        {step === STEPS.PAYING && (
          <>
            <div className="spinner" aria-hidden="true" />
            <p className="status" style={{ textAlign: 'center' }}>Processing payment...</p>
          </>
        )}

        {step === STEPS.DONE && booking && (
          <>
            <p className="status">Parking area allotted:</p>
            <div className="fee">{booking.spot_code}</div>
            <p className="status">Vehicle: {booking.vehicle_number}</p>
            <p className="status">Valid until {new Date(booking.expected_exit_time).toLocaleString()}</p>
            <p className="status">Amount paid: {money(booking.fee_cents)}</p>
            <p className="status">Invoice sent to {booking.driver_email}.</p>
            {invoice && (
              <details style={{ marginTop: 12, textAlign: 'left' }}>
                <summary>View invoice</summary>
                <div dangerouslySetInnerHTML={{ __html: invoice.html }} />
              </details>
            )}
          </>
        )}
      </div>

      {step === STEPS.PLATE_CONFIRM && (
        <CarPlateOverlay vehicleNumber={vehicleNumber} onContinue={goToSpotPicker} onBack={() => setStep(STEPS.DETAILS)} />
      )}
    </div>
  );
}
