import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import LandingPage from './views/LandingPage';
import GuestView from './views/GuestView';
import SuperAdminDashboard from './views/SuperAdminDashboard';
import SuperAdminLoginForm from './views/SuperAdminLoginForm';
import { useAuth } from './context/AuthContext';
import './App.css';

function App() {
  const { user, login, logout, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showLogin, setShowLogin] = useState(false);

  const handleLogin = async (e) => {
    e?.preventDefault();
    setLoginError('');
    const result = await login(email, password);
    if (result.success) {
      setShowLogin(false);
      setEmail('');
      setPassword('');
    } else {
      setLoginError(result.error || 'Login failed');
    }
  };

  const handleLogout = () => {
    logout();
    setShowLogin(false);
  };

  if (loading) {
    return <div className="App App-loading">Loading...</div>;
  }

  // Feature flags / host overrides (toggleable via .env)
  const HIDE_GUEST_LOGIN = process.env.REACT_APP_HIDE_GUEST_LOGIN === 'true';
  const SUPERADMIN_URL = process.env.REACT_APP_SUPERADMIN_URL || '';
  const APP_MODE = process.env.REACT_APP_MODE || 'all'; // 'guest', 'admin', or 'all'

  // Location-aware auth UI. When REACT_APP_HIDE_GUEST_LOGIN=true the login
  // controls are hidden on the public Guest View (root). Otherwise shown as before.
  // eslint-disable-next-line no-unused-vars
  const LocationAwareAuth = () => {
    const location = useLocation();
    if ((location?.pathname === '/' || location?.pathname === '/guest') && HIDE_GUEST_LOGIN) return null;

    return (
      <li className="auth-section">
        {user ? (
          <>
            <span>Logged in as: <b>{user.name || user.email}</b> ({user.role})</span>
            <button onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            {!showLogin ? (
              <button onClick={() => setShowLogin(true)}>Login</button>
            ) : (
              <form onSubmit={handleLogin}>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button type="submit">Login</button>
                <button type="button" onClick={() => {
                  setShowLogin(false);
                  setLoginError('');
                }}>Cancel</button>
              </form>
            )}
            {loginError && <span style={{ color: '#ff6b6b' }}>{loginError}</span>}
          </>
        )}
      </li>
    );
  };

  // Route guard that optionally redirects unauthenticated visitors to a separate
  // super-admin host (useful for running super-admin on a different localhost port).
  const SuperAdminGate = ({ children }) => {
    const location = useLocation();
    React.useEffect(() => {
      if (!user && SUPERADMIN_URL && location.pathname.startsWith('/super-admin')) {
        const target = SUPERADMIN_URL.endsWith('/') ? SUPERADMIN_URL.slice(0, -1) : SUPERADMIN_URL;
        window.location.assign(target + '/super-admin');
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    if (!user) return null;
    if (user.role !== 'super_admin') return <div style={{ padding: 20 }}>You do not have permission to view this page.</div>;
    return children;
  };

  return (
    <Router>
      <div className="App">
        <div className="main-route">
        <Routes>
          {/* Landing Page - shown in 'all' mode */}
          {APP_MODE === 'all' && (
            <Route path="/" element={<LandingPage />} />
          )}

          {/* Guest View Routes - shown in 'guest' or 'all' mode */}
          {(APP_MODE === 'guest' || APP_MODE === 'all') && (
            <>
              {/* Root shows the Guest View in guest-only mode */}
              {APP_MODE === 'guest' && <Route path="/" element={<GuestView />} />}

              {/* Public Guest view */}
              <Route path="/guest" element={<GuestView />} />
            </>
          )}

          {/* Super Admin Routes - shown in 'admin' or 'all' mode */}
          {(APP_MODE === 'admin' || APP_MODE === 'all') && (
            <>
              {/* Super Admin login form */}
              <Route path="/super-admin-login-form" element={<SuperAdminLoginForm />} />

              {/* Guarded Super Admin route */}
              <Route path="/super-admin" element={<SuperAdminGate><SuperAdminDashboard /></SuperAdminGate>} />
            </>
          )}

          {/* If admin-only mode, redirect root to login */}
          {APP_MODE === 'admin' && (
            <Route path="/" element={<SuperAdminLoginForm />} />
          )}
        </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;