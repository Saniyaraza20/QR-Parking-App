import { useEffect, useRef, useState } from 'react';
import { api, getUserFromToken } from '../api';
import { useConfirm } from '../components/Confirm';
import { useToast } from '../components/Toast';

function money(cents) {
  return cents == null ? '-' : '\u20b9' + (cents / 100).toFixed(2);
}

export default function StaffDashboard() {
  const [overview, setOverview] = useState(null);
  const [today, setToday] = useState(null);
  const [error, setError] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [spotError, setSpotError] = useState(null);
  const [justChanged, setJustChanged] = useState({}); // spotId -> true, briefly, for the flash animation
  const isManager = getUserFromToken()?.role === 'manager';
  const confirm = useConfirm();
  const notify = useToast();
  const prevStatuses = useRef({});

  async function refresh() {
    try {
      const [ov, td] = await Promise.all([api.overview(), api.sessionsToday()]);

      const changed = {};
      for (const s of ov.spots) {
        if (prevStatuses.current[s.id] && prevStatuses.current[s.id] !== s.status) {
          changed[s.id] = true;
        }
        prevStatuses.current[s.id] = s.status;
      }
      if (Object.keys(changed).length) {
        setJustChanged(changed);
        setTimeout(() => setJustChanged({}), 1500);
      }

      setOverview(ov);
      setToday(td);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  async function forceClose(spotId, spotCode) {
    if (!(await confirm(`Force close the session on ${spotCode}? This ends it immediately with no further payment.`))) return;
    try {
      await api.forceClose(spotId);
      notify(`${spotCode} force closed`, { type: 'success' });
      refresh();
    } catch (e) {
      notify(e.message, { type: 'error' });
    }
  }

  async function toggleDisabled(spotId, spotCode, currentlyDisabled) {
    const verb = currentlyDisabled ? 'enable' : 'disable';
    if (!(await confirm(`${verb === 'enable' ? 'Enable' : 'Disable'} ${spotCode}?`))) return;
    try {
      await api.toggleDisabled(spotId);
      notify(`${spotCode} ${verb}d`, { type: 'success' });
      refresh();
    } catch (e) {
      notify(e.message, { type: 'error' });
    }
  }

  async function viewQr() {
    if (!qrDataUrl) {
      const d = await api.getQrCode();
      setQrDataUrl(d.dataUrl);
    }
    setShowQr(true);
  }

  async function addSpot(e) {
    e.preventDefault();
    setSpotError(null);
    try {
      await api.createSpot(newCode.trim(), newLabel.trim());
      notify(`Spot ${newCode.trim().toUpperCase()} added`, { type: 'success' });
      setNewCode('');
      setNewLabel('');
      refresh();
    } catch (e) {
      setSpotError(e.message);
    }
  }

  if (error) return <div className="page wide"><p className="error">{error}</p></div>;
  if (!overview || !today) {
    return (
      <div className="page wide">
        <h1>Staff dashboard</h1>
        <div className="stats">
          {[1, 2, 3].map((i) => <div key={i} className="stat skeleton" style={{ height: 62 }} />)}
        </div>
        <div className="grid" style={{ marginTop: 16 }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 78, borderRadius: 10 }} />)}
        </div>
      </div>
    );
  }

  const occupied = overview.spots.filter((s) => s.status === 'occupied').length;
  const occupancyPct = overview.spots.length ? Math.round((occupied / overview.spots.length) * 100) : 0;

  return (
    <div className="page wide">
      <h1>Staff dashboard</h1>
      <p>
        <button className="secondary" onClick={viewQr}>View entrance QR code</button>
        {' '}
        <a href="/staff/transactions">All transactions</a>
      </p>

      {showQr && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
        }} onClick={() => setShowQr(false)} role="dialog" aria-modal="true" aria-label="Lot entrance QR code">
          <div className="card" style={{ textAlign: 'center', maxWidth: 'min(360px, calc(100vw - 32px))' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Lot entrance QR code</h2>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Lot entrance QR code" style={{ width: 280, height: 280, maxWidth: '100%' }} />
            ) : (
              <div className="skeleton" style={{ width: 280, height: 280, maxWidth: '100%', margin: '0 auto' }} />
            )}
            <div className="wizard-nav">
              <button className="secondary" onClick={() => setShowQr(false)}>Close</button>
              <a href={qrDataUrl} download="lot-entrance-qr.png" style={{ flex: 1 }}>
                <button className="primary" style={{ marginTop: 0 }}>Download PNG</button>
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="num">{occupied}/{overview.spots.length} ({occupancyPct}%)</div>
          <div className="label">Spots occupied</div>
        </div>
        <div className="stat">
          <div className="num">{money(today.revenue_cents)}</div>
          <div className="label">Revenue today</div>
        </div>
        <div className="stat">
          <div className="num">{money(overview.flat_fee_cents)}</div>
          <div className="label">Flat fee per booking</div>
        </div>
      </div>

      <h2>Live spots</h2>
      <div className="grid">
        {overview.spots.map((s) => (
          <div key={s.id} className={`spot ${s.status} ${justChanged[s.id] ? 'just-changed' : ''}`}>
            <div className="code">{s.code}</div>
            <div className="time">{s.status}</div>
            {s.status === 'occupied' && (
              <>
                {s.vehicle_number && <div className="time">{s.vehicle_number}</div>}
                {s.driver_name && <div className="time">{s.driver_name}</div>}
                {s.expected_exit_time && (
                  <div className="time">until {new Date(s.expected_exit_time).toLocaleTimeString()}</div>
                )}
              </>
            )}
            {s.status === 'occupied' && (
              <button className="secondary danger" onClick={() => forceClose(s.id, s.code)}>Force close</button>
            )}
            {s.status !== 'occupied' && (
              <button className="secondary" onClick={() => toggleDisabled(s.id, s.code, s.status === 'disabled')}>
                {s.status === 'disabled' ? 'Enable' : 'Disable'}
              </button>
            )}
          </div>
        ))}
      </div>

      {isManager && (
        <>
          <h2>Add a spot</h2>
          <div className="card" style={{ maxWidth: 420 }}>
            <form onSubmit={addSpot}>
              <label htmlFor="code">Spot code</label>
              <input id="code" type="text" placeholder="e.g. B-01" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
              <label htmlFor="label">Label (optional)</label>
              <input id="label" type="text" placeholder="e.g. Overflow lot spot 1" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
              {spotError && <p className="error">{spotError}</p>}
              <button className="primary" type="submit">Add spot</button>
            </form>
          </div>
        </>
      )}

      <h2>Today's sessions</h2>
      <table>
        <thead>
          <tr>
            <th>Spot</th><th>Vehicle</th><th>Entry</th><th>Fee</th><th>Payment</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {today.sessions.map((s) => (
            <tr key={s.id}>
              <td>{s.spot_code}</td>
              <td>{s.vehicle_number}</td>
              <td>{new Date(s.entry_time).toLocaleTimeString()}</td>
              <td>{money(s.fee_cents)}</td>
              <td><span className={`badge ${s.payment_status}`}>{s.payment_status}</span></td>
              <td>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
