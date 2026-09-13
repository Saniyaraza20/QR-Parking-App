import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, setDriverToken } from '../api';
import GoogleSignInButton from '../components/GoogleSignInButton';
import PasswordStrength from '../components/PasswordStrength';

export default function DriverRegister() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo'); // e.g. bounce back to the scan link they came from

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.registerDriver(name, email, password);
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
      <h1>Create a driver account</h1>
      <div className="card">
        <p className="status">Optional — you can always just scan and go without one. An account gets you a history of your parking sessions.</p>
        <form onSubmit={submit}>
          <label htmlFor="name">Name</label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

          <label htmlFor="email">Email</label>
          <input id="email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} />

          <label htmlFor="password">Password (min 8 characters)</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <PasswordStrength password={password} />

          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <GoogleSignInButton onToken={handleGoogleToken} />

        <p><small>Already have an account? <a href={`/driver/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}>Log in</a></small></p>
      </div>
    </div>
  );
}
