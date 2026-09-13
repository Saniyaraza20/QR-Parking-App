import { useState } from 'react';
import { api } from '../api';

export default function DriverForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email);
    } finally {
      setLoading(false);
      setDone(true); // show the same message either way - don't reveal if the email exists
    }
  }

  return (
    <div className="page">
      <h1>Reset your password</h1>
      <div className="card">
        {done ? (
          <p className="status">If that email has an account, a reset link has been generated. Check with the site operator locally for the link during development.</p>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="email">Email</label>
            <input id="email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            <button className="primary" type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}
        <p><small><a href="/driver/login">Back to login</a></small></p>
      </div>
    </div>
  );
}
