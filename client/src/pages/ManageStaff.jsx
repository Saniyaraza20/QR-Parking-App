import { useEffect, useState } from 'react';
import { api } from '../api';
import { useConfirm } from '../components/Confirm';
import { useToast } from '../components/Toast';

export default function ManageStaff() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState('staff');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState(null); // holds { username, temp_password } once
  const [justReset, setJustReset] = useState(null);
  const confirm = useConfirm();
  const notify = useToast();

  async function refresh() {
    try {
      const data = await api.listUsers();
      setUsers(data.users);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createUser(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setJustCreated(null);
    try {
      const result = await api.createUser(newUsername.trim(), newRole);
      setJustCreated(result);
      notify(`Login created for ${result.username}`, { type: 'success' });
      setNewUsername('');
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function deactivate(id, username) {
    if (!(await confirm(`Deactivate ${username}? They won't be able to log in until reactivated.`))) return;
    try {
      await api.deactivateUser(id);
      notify(`${username} deactivated`, { type: 'success' });
      refresh();
    } catch (e) {
      notify(e.message, { type: 'error' });
    }
  }

  async function reactivate(id, username) {
    try {
      await api.reactivateUser(id);
      notify(`${username} reactivated`, { type: 'success' });
      refresh();
    } catch (e) {
      notify(e.message, { type: 'error' });
    }
  }

  async function resetPassword(id, username) {
    if (!(await confirm(`Reset ${username}'s password? Their current password will stop working immediately.`))) return;
    setJustCreated(null);
    try {
      const result = await api.resetStaffPassword(id);
      setJustReset(result);
      notify(`Password reset for ${username}`, { type: 'success' });
      refresh();
    } catch (e) {
      notify(e.message, { type: 'error' });
    }
  }

  return (
    <div className="page wide">
      <h1>Manage staff logins</h1>
      <p className="status">Manager-only. New accounts get a one-time temp password and must set their own on first login.</p>

      {justCreated && (
        <div className="card" style={{ borderColor: '#c98a2f', background: '#fff8ee' }}>
          <p className="status"><strong>Account created — this password is shown once and not stored anywhere:</strong></p>
          <p>Username: <strong>{justCreated.username}</strong></p>
          <p>Temp password: <code>{justCreated.temp_password}</code></p>
          <p><small>Share this with {justCreated.username} directly (not over an unsecured channel). It stops working after their first login.</small></p>
          <button className="secondary" onClick={() => setJustCreated(null)}>Dismiss</button>
        </div>
      )}

      {justReset && (
        <div className="card" style={{ borderColor: '#c98a2f', background: '#fff8ee' }}>
          <p className="status"><strong>Password reset — shown once, not stored anywhere:</strong></p>
          <p>Username: <strong>{justReset.username}</strong></p>
          <p>Temp password: <code>{justReset.temp_password}</code></p>
          <p><small>Share this with {justReset.username} directly. They'll be forced to set their own on next login.</small></p>
          <button className="secondary" onClick={() => setJustReset(null)}>Dismiss</button>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Create new login</h2>
        <form onSubmit={createUser}>
          <label htmlFor="newUsername">Username</label>
          <input
            id="newUsername"
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="e.g. jsmith"
          />
          <label htmlFor="newRole">Role</label>
          <select id="newRole" value={newRole} onChange={(e) => setNewRole(e.target.value)}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', marginTop: 4 }}>
            <option value="staff">Staff (day-to-day dashboard)</option>
            <option value="manager">Manager (can also manage logins &amp; rate)</option>
          </select>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={creating || !newUsername.trim()}>
            {creating ? 'Creating...' : 'Create login'}
          </button>
        </form>
      </div>

      <h2>Existing logins</h2>
      {!users && <p className="status">Loading...</p>}
      {users && (
        <table>
          <thead>
            <tr><th>Username</th><th>Role</th><th>Status</th><th>Password</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>{u.active ? 'active' : 'deactivated'}</td>
                <td>{u.must_change_password ? 'temp (unused)' : 'set'}</td>
                <td>
                  {u.active ? (
                    <button className="secondary" onClick={() => deactivate(u.id, u.username)}>Deactivate</button>
                  ) : (
                    <button className="secondary" onClick={() => reactivate(u.id, u.username)}>Reactivate</button>
                  )}
                  {' '}
                  <button className="secondary" onClick={() => resetPassword(u.id, u.username)}>Reset password</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
