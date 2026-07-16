import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './SuperAdminLoginForm.css';

export default function SuperAdminLoginForm() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Invalid email or password');
      return;
    }

    setLoading(true);

    try {
      const result = await login(trimmedEmail, password);

      if (!result || !result.success) {
        setError('Invalid email or password');
        return;
      }

      if (result.user?.role === 'super_admin') {
        navigate('/super-admin');
        return;
      }

      setError(`Your account (${result.user?.role || 'unknown'}) does not have super administrator privileges.`);
    } catch (err) {
      console.error('SuperAdminLoginForm error', err);
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page admin-auth-page">
      <div className="admin-auth-bg-media" aria-hidden="true">
        <img src="/bg.jpg" alt="" />
      </div>

      <button
        type="button"
        className="back-to-home back-link"
        onClick={() => navigate('/')}
        aria-label="Back to home"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Back</span>
      </button>

      <div className="admin-login-container admin-auth-container">
        <div className="admin-login-card admin-auth-card">
          <div className="admin-brand-row">
            <img src="/alagad.png" alt="ALAGAD Logo" className="admin-brand-logo" />
            <div className="admin-heading-wrap">
              <h1 className="login-heading">Administrator Portal</h1>
              <p className="login-subtitle">Secure access for authorized personnel only.</p>
            </div>
          </div>

          <div className="security-badge" aria-label="Security verified badge">
            <svg
              className="shield-icon"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              role="img"
              aria-label="Shield security icon"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Secured Login</span>
          </div>

          <form className="login-form" onSubmit={handleSubmit} aria-label="Administrator login form">
            <div className="form-group">
              <label htmlFor="admin-email" className="form-label">Email Address</label>
              <div className="input-wrap">
                <input
                  id="admin-email"
                  type="email"
                  className="form-input"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@institution.edu"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="admin-password" className="form-label">Password</label>
              <div className="input-wrap input-wrap-password">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.966 9.966 0 012.252-3.592M6.6 6.6A9.965 9.965 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.022 10.022 0 01-4.128 5.411M9.88 9.88a3 3 0 104.24 4.24" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                  <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="form-error" role="alert" aria-live="assertive">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? (
                <>
                  <svg className="spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          <p className="login-footer">Need help? Contact your system administrator for login assistance or access requests.</p>
        </div>
      </div>
    </div>
  );
}
