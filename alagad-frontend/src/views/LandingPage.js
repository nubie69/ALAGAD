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

      <section className="hero-section" aria-label="ALAGAD hero section">
        <div className="hero-gradient" aria-hidden="true" />
        <div className="hero-content">
          <img src="/alagad.png" alt="ALAGAD Logo" className="landing-logo" />
          <h1 className="hero-title">YOUR SMART GUIDE TO BUKSU</h1>
          <p className="hero-subtitle">ALAGAD &mdash; Navigate Your Campus Effortlessly.</p>
        </div>
      </section>

      <section className="main-panels" aria-label="Landing options">
        <div className="panels-grid">
          <article className="portal-card" role="button" tabIndex={0} onClick={() => navigate('/guest')}>
            <div className="portal-icon-circle portal-icon-circle-blue" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6.5L9 4l6 3 6-2.5v13L15 20l-6-3-6 2.5v-13z" />
                <path d="M9 4v13" />
                <path d="M15 7v13" />
                <path d="M7.2 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
                <path d="M7.2 13.3v1.6" />
                <path d="M16.9 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
                <path d="M16.9 11.8v1.7" />
              </svg>
            </div>
            <h2 className="portal-title">Public Map View</h2>
            <p className="portal-description">Explore BukSU&apos;s interactive map &mdash; locate buildings, offices, and facilities instantly.</p>
            <button className="portal-button guest-portal-btn" onClick={(e) => { e.stopPropagation(); navigate('/guest'); }}>
              Explore Map &rarr;
            </button>
          </article>

          <article className="portal-card" role="button" tabIndex={0} onClick={() => navigate('/super-admin-login-form')}>
            <div className="portal-icon-circle portal-icon-circle-gray" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7" cy="6.2" r="2.2" />
                <path d="M3.8 13c.6-1.9 2.1-3 4-3s3.4 1.1 4 3" />
                <rect x="11.5" y="7.5" width="8.8" height="5.8" rx="1" />
                <path d="M14.8 16.2h2.2" />
                <circle cx="19.2" cy="16.6" r="1.4" />
                <path d="M19.2 14.4v.8M19.2 18v.8M17.6 16.6h.8M20 16.6h.8" />
              </svg>
            </div>
            <h2 className="portal-title">Admin Dashboard</h2>
            <p className="portal-description">Manage records, customize maps, and control settings securely &mdash; all in one place.</p>
            <button className="portal-button admin-portal-btn" onClick={(e) => { e.stopPropagation(); navigate('/super-admin-login-form'); }}>
              Sign in &rarr;
            </button>
          </article>
        </div>
      </section>

      <section className="features-section" aria-label="Key features">
        <h2 className="features-heading">Key Features</h2>
        <div className="features-grid">
          <article className="feature-box">
            <div className="feature-box-icon feature-icon-map">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                role="img"
                aria-label="Interactive map compass icon"
              >
                <circle cx="12" cy="12" r="6.8" />
                <path d="M12 3.8v1.7M12 18.5v1.7M3.8 12h1.7M18.5 12h1.7" />
                <path d="M9.2 14.8l2-5.6 5.6-2-2 5.6-5.6 2z" />
              </svg>
            </div>
            <h3 className="feature-box-label">Interactive Map</h3>
            <p className="feature-box-description">Scan every campus spot in seconds.</p>
          </article>
          <article className="feature-box">
            <div className="feature-box-icon feature-icon-directions">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                role="img"
                aria-label="Smart directions pin and arrow icon"
              >
                <path d="M10.8 19.8s4.4-3.9 4.4-7.4a4.4 4.4 0 1 0-8.8 0c0 3.5 4.4 7.4 4.4 7.4z" />
                <circle cx="10.8" cy="12.3" r="1.4" />
                <path d="M16.6 5.5H21v4.4" />
                <path d="M20.8 5.7l-3.4 3.4" />
              </svg>
            </div>
            <h3 className="feature-box-label">Smart Directions</h3>
            <p className="feature-box-description">Get route hints to the right office fast.</p>
          </article>
          <article className="feature-box">
            <div className="feature-box-icon feature-icon-ai">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                role="img"
                aria-label="AI assistant brain icon"
              >
                <path d="M9.4 6.2a2.6 2.6 0 0 0-4.6 1.8 2.7 2.7 0 0 0 .6 5.3 2.5 2.5 0 0 0 3.8 2.1" />
                <path d="M14.6 6.2a2.6 2.6 0 0 1 4.6 1.8 2.7 2.7 0 0 1-.6 5.3 2.5 2.5 0 0 1-3.8 2.1" />
                <path d="M12 5.3v13.4" />
                <path d="M9.3 9.2H12M9.3 12.4H12M12 9.2h2.7M12 12.4h2.7" />
              </svg>
            </div>
            <h3 className="feature-box-label">AI Assistant</h3>
            <p className="feature-box-description">Ask naturally and get clear campus answers.</p>
          </article>
        </div>
      </section>

      <footer className="landing-footer">
        <nav className="landing-footer-links" aria-label="Footer links">
          <a href="#privacy">Privacy Policy</a>
          <a href="#contact">Contact</a>
          <a href="#help">Help</a>
        </nav>
        <p className="landing-footer-copy">&copy; 2026 ALAGAD &middot; BukSU Campus Navigation &amp; Assistant &middot; Powered by AI.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
