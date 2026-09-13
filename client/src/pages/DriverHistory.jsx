import { useEffect, useState } from 'react';
import { api, getDriverFromToken, clearDriverToken } from '../api';
import { useNavigate } from 'react-router-dom';

function money(cents) {
  return cents == null ? '-' : '\u20b9' + (cents / 100).toFixed(2);
}

function formatCountdown(ms) {
  if (ms <= 0) return 'expired';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m remaining`;
}

export default function DriverHistory() {
  const [sessions, setSessions] = useState(null);
  const [entryUrl, setEntryUrl] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());
  const driver = getDriverFromToken();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .driverSessions()
      .then((d) => setSessions(d.sessions))
      .catch((e) => {
        if (e.status !== 401) setError(e.message);
      });
    // Fetch the entrance link so a logged-in driver can start a new booking
    // directly from here - this is the "how do I actually park" action that
    // was missing from this page before.
    api.entryLink().then((d) => setEntryUrl(d.url)).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  function logout() {
    clearDriverToken();
    navigate('/');
  }

  function parkNow() {
    if (entryUrl) navigate(entryUrl); // entryUrl is already a relative path like /entry?token=...
  }

  const active = sessions?.find((s) => s.status === 'active');

  return (
    <div className="page">
      <h1>My parking</h1>
      <p className="status">{driver?.email}</p>

      {/* Primary action: actually park. Always visible so a logged-in driver
          is never stuck on a page with nothing to do. */}
      <div className="card" style={{ textAlign: 'center' }}>
        <p className="status" style={{ marginTop: 0 }}>
          {active ? 'You already have an active booking below.' : 'Ready to park? Start a new booking.'}
        </p>
        <button className="primary" onClick={parkNow} disabled={!entryUrl}>
          {active ? 'Book another spot' : 'Park now'}
        </button>
      </div>

      {active && (
        <div className="card" style={{ borderColor: '#2e7d32', background: '#f1f8f1' }}>
          <p className="status" style={{ marginTop: 0 }}>Currently parked</p>
          <div className="fee">{active.spot_code}</div>
          <p className="status">{active.vehicle_number}</p>
          <p className="status">{formatCountdown(new Date(active.expected_exit_time) - now)}</p>
        </div>
      )}

      <h2>History</h2>
      <div className="card">
        {error && <p className="error">{error}</p>}
        {!sessions && !error && <p className="status">Loading...</p>}
        {sessions && sessions.length === 0 && (
          <p className="status">No bookings yet - tap “Park now” above to get started.</p>
        )}
        {sessions && sessions.length > 0 && (
          <table>
            <thead>
              <tr><th>Spot</th><th>Vehicle</th><th>Entry</th><th>Valid until</th><th>Fee</th><th>Status</th></tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.spot_code}</td>
                  <td>{s.vehicle_number}</td>
                  <td>{new Date(s.entry_time).toLocaleString()}</td>
                  <td>{s.expected_exit_time ? new Date(s.expected_exit_time).toLocaleString() : '-'}</td>
                  <td>{money(s.fee_cents)}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <button className="secondary" onClick={logout}>Log out</button>
    </div>
  );
}
