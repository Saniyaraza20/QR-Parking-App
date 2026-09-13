import { Link, useNavigate } from 'react-router-dom';
import { clearToken, getToken, getUserFromToken, clearDriverToken, getDriverToken, getDriverFromToken } from '../api';
import { useToast } from './Toast';

export default function TopBar({ user, setUser }) {
  const navigate = useNavigate();
  const notify = useToast();
  const staffLoggedIn = !!getToken();
  const tokenUser = staffLoggedIn ? getUserFromToken() : null;
  const driverLoggedIn = !!getDriverToken();
  const driver = driverLoggedIn ? getDriverFromToken() : null;

  function staffLogout() {
    clearToken();
    setUser(null);
    navigate('/login');
    notify('Signed out', { type: 'info' });
  }

  function driverLogout() {
    clearDriverToken();
    navigate('/');
    notify('Signed out', { type: 'info' });
  }

  return (
    <nav className="topbar" aria-label="Main navigation">
      <Link to="/" aria-label="Home">🅿️ Parking</Link>
      <div className="right">
        <div className="group">
          {staffLoggedIn ? (
            <>
              <Link to="/staff">Staff dashboard</Link>
              {tokenUser?.role === 'manager' && <Link to="/staff/users">Manage staff</Link>}
              <span className="status">{user?.username || tokenUser?.username}</span>
              <button className="secondary" onClick={staffLogout}>Log out</button>
            </>
          ) : (
            <Link to="/login">Staff login</Link>
          )}
        </div>

        <div className="group">
          {driverLoggedIn ? (
            <>
              <Link to="/driver/history">My parking</Link>
              <span className="status">{driver?.email}</span>
              <button className="secondary" onClick={driverLogout}>Driver log out</button>
            </>
          ) : (
            <Link to="/driver/login">Driver login</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
