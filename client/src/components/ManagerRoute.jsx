import { Navigate } from 'react-router-dom';
import { isStaffTokenValid, clearToken, getToken, getUserFromToken } from '../api';

export default function ManagerRoute({ children }) {
  if (!isStaffTokenValid()) {
    if (getToken()) clearToken();
    return <Navigate to="/login" replace />;
  }
  const user = getUserFromToken();
  if (!user || user.role !== 'manager') return <Navigate to="/staff" replace />;
  return children;
}
