import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';
import PasswordStrength from '../components/PasswordStrength';
import { useToast } from '../components/Toast';

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
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
      setError('New password and confirmation do not match');
      return;
    }
    setLoading(true);
    try {
      const data = await api.changePassword(currentPassword, newPassword);
      setToken(data.token);
      notify('Password updated', { type: 'success' });
      navigate('/staff');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1>Set a new password</h1>
      <div className="card">
        <p className="status">
          You're signed in with a temporary password. Set your own before continuing.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="current">Current (temporary) password</label>
          <input id="current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus />

          <label htmlFor="new">New password (min 8 characters)</label>
          <input id="new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <PasswordStrength password={newPassword} />

          <label htmlFor="confirm">Confirm new password</label>
          <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />

          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  );
}
