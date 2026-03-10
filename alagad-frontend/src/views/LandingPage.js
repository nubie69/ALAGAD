import React from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <div className="landing-page-background">
        <img src="/bg.jpg" alt="" className="landing-bg-image" />
      </div>

      {/* Hero Section with illustrated background */}
      <div className="hero-section">
        <div className="hero-content">
          <img src="/alagad.png" alt="ALAGAD Logo" className="landing-logo" />
          <div className="hero-text">
            <h1 className="hero-title">
              ALAGAD: Navigate Your Campus Effortlessly
            </h1>
            <p className="hero-subtitle">
              Your interactive guide to buildings, facilities, offices, and services on campus.
            </p>
          </div>
        </div>
      </div>

      {/* Portal Cards */}
      <div className="cards-section">
        <div className="cards-row">
          {/* Public Map View */}
          <div className="portal-card" onClick={() => navigate('/guest')}>
            <div className="portal-card-illustration">
              <img src="/p_map.png" alt="Public Map View" className="portal-card-img" />
            </div>
            <h2 className="portal-title">Public Map View</h2>
            <p className="portal-description">Browse the interactive campus map to locate buildings, offices, and facilities — no account needed.</p>
            <button className="portal-button guest-portal-btn">
              Explore Map
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>

          {/* Admin Dashboard */}
          <div className="portal-card" onClick={() => navigate('/super-admin-login-form')}>
            <div className="portal-card-illustration">
               <img src="/admin_dashboard.png" alt="Public Map View" className="portal-card-img" />
            </div>
            <h2 className="portal-title">Admin Dashboard</h2>
            <p className="portal-description">Manage campus records, map features, and system settings through a secure administrative portal.</p>
            <button className="portal-button admin-portal-btn">
              Sign In
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Key Features */}
      <div className="features-section">
        <h2 className="features-heading">Key Features</h2>
        <div className="features-row">
          <div className="feature-box">
            <div className="feature-box-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <span className="feature-box-label">Interactive Map</span>
          </div>
          <div className="feature-box">
            <div className="feature-box-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                <path d="M10 8v4m0 0l2 2m-2-2l-2 2" />
              </svg>
            </div>
            <span className="feature-box-label">Search &amp; Directions</span>
          </div>
          <div className="feature-box">
            <div className="feature-box-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <span className="feature-box-label">AI Assistant</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="landing-footer">
        <p>&copy; 2026 ALAGAD &middot; BukSU Campus Navigation &amp; Assistant &middot; Powered by AI</p>
      </footer>
    </div>
  );
};

export default LandingPage;
