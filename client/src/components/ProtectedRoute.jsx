import { Navigate } from 'react-router-dom';
import { isStaffTokenValid, clearToken, getToken } from '../api';

export default function ProtectedRoute({ children }) {
  if (!isStaffTokenValid()) {
    if (getToken()) clearToken();
    return <Navigate to="/login" replace />;
  }
  return children;
}
