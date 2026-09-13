import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PasswordStrength from '../components/PasswordStrength';
import { useToast } from '../components/Toast';

export default function DriverResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const notify = useToast();

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, newPassword);
      notify('Password reset - please log in', { type: 'success' });
      navigate('/driver/login');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="page">
        <h1>Reset password</h1>
        <div className="card"><p className="error">Missing reset token — use the link from your reset email.</p></div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Set a new password</h1>
      <div className="card">
        <form onSubmit={submit}>
          <label htmlFor="new">New password (min 8 characters)</label>
          <input id="new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
          <PasswordStrength password={newPassword} />
          <label htmlFor="confirm">Confirm new password</label>
          <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  );
}
