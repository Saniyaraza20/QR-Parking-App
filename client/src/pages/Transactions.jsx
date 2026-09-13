import { useEffect, useState } from 'react';
import { api } from '../api';

function money(cents) {
  return cents == null ? '-' : '\u20b9' + (cents / 100).toFixed(2);
}

export default function Transactions() {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const filters = {};
      if (status) filters.status = status;
      if (from) filters.from = from;
      if (to) filters.to = to;
      const d = await api.listAllSessions(filters);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page wide">
      <h1>Transactions</h1>
      <div className="card">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label htmlFor="status">Status</label>
            <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #ccc' }}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="pending_payment">Pending payment</option>
              <option value="payment_failed">Payment failed</option>
              <option value="force_closed">Force closed</option>
            </select>
          </div>
          <div>
            <label htmlFor="from">From</label>
            <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #ccc' }} />
          </div>
          <div>
            <label htmlFor="to">To</label>
            <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #ccc' }} />
          </div>
          <button className="secondary" onClick={load}>Filter</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <p className="status">{data.sessions.length} rows &middot; {money(data.revenue_cents)} total (paid only)</p>
          <table>
            <thead>
              <tr><th>Spot</th><th>Vehicle</th><th>Driver</th><th>Entry</th><th>Fee</th><th>Payment</th><th>Status</th><th>Closed by</th></tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.spot_code}</td>
                  <td>{s.vehicle_number}</td>
                  <td>{s.driver_name}</td>
                  <td>{new Date(s.entry_time).toLocaleString()}</td>
                  <td>{money(s.fee_cents)}</td>
                  <td><span className="badge">{s.payment_status}</span></td>
                  <td>{s.status}</td>
                  <td>{s.closed_by || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
