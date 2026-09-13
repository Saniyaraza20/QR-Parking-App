import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, setDriverToken } from '../api';
import GoogleSignInButton from '../components/GoogleSignInButton';

export default function DriverLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo');

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.loginDriver(email, password);
      setDriverToken(data.token);
      navigate(returnTo || '/driver/history');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleToken(idToken) {
    setError(null);
    try {
      const data = await api.loginWithGoogle(idToken);
      setDriverToken(data.token);
      navigate(returnTo || '/driver/history');
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="page">
      <h1>Driver login</h1>
      <div className="card">
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />

          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <GoogleSignInButton onToken={handleGoogleToken} />

        <p><small>No account yet? <a href={`/driver/register${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}>Create one</a></small></p>
        <p><small><a href="/driver/forgot-password">Forgot password?</a></small></p>
      </div>
    </div>
  );
}
