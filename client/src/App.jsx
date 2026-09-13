import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import TopBar from './components/TopBar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import EntryFlow from './pages/EntryFlow';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import StaffDashboard from './pages/StaffDashboard';
import ManageStaff from './pages/ManageStaff';
import ManagerRoute from './components/ManagerRoute';
import DriverRoute from './components/DriverRoute';
import DriverLogin from './pages/DriverLogin';
import DriverRegister from './pages/DriverRegister';
import DriverHistory from './pages/DriverHistory';
import DriverForgotPassword from './pages/DriverForgotPassword';
import DriverResetPassword from './pages/DriverResetPassword';
import Transactions from './pages/Transactions';
import { setUnauthorizedHandler, setMustChangePasswordHandler, setDriverUnauthorizedHandler } from './api';
import { useToast } from './components/Toast';

function AppInner() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const notify = useToast();

  const handleUnauthorized = useCallback(() => {
    setUser(null);
    navigate('/login');
    notify('Your session expired — please log in again.', { type: 'info' });
  }, [navigate, notify]);

  const handleMustChangePassword = useCallback(() => {
    navigate('/change-password');
    notify('Set a new password to continue.', { type: 'info' });
  }, [navigate, notify]);

  const handleDriverUnauthorized = useCallback(() => {
    navigate('/driver/login');
    notify('Your session expired — please log in again.', { type: 'info' });
  }, [navigate, notify]);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
    setMustChangePasswordHandler(handleMustChangePassword);
    setDriverUnauthorizedHandler(handleDriverUnauthorized);
  }, [handleUnauthorized, handleMustChangePassword, handleDriverUnauthorized]);

  return (
    <>
      <TopBar user={user} setUser={setUser} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/entry" element={<EntryFlow />} />
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePassword />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <ProtectedRoute>
              <StaffDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/users"
          element={
            <ManagerRoute>
              <ManageStaff />
            </ManagerRoute>
          }
        />
        <Route
          path="/staff/transactions"
          element={
            <ProtectedRoute>
              <Transactions />
            </ProtectedRoute>
          }
        />
        <Route path="/driver/login" element={<DriverLogin />} />
        <Route path="/driver/register" element={<DriverRegister />} />
        <Route path="/driver/forgot-password" element={<DriverForgotPassword />} />
        <Route path="/driver/reset-password" element={<DriverResetPassword />} />
        <Route
          path="/driver/history"
          element={
            <DriverRoute>
              <DriverHistory />
            </DriverRoute>
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
