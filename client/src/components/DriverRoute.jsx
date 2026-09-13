import { Navigate } from 'react-router-dom';
import { isDriverTokenValid, clearDriverToken, getDriverToken } from '../api';

export default function DriverRoute({ children }) {
  // Redirect to login if there's no token OR the token has expired - checking
  // expiry here (not just existence) means an expired session sends the user
  // straight to login instead of briefly rendering the page and then having
  // it wiped by a 401, which looked like the content had "disappeared."
  if (!isDriverTokenValid()) {
    if (getDriverToken()) clearDriverToken();
    return <Navigate to="/driver/login" replace />;
  }
  return children;
}
