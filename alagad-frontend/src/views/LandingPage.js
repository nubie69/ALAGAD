import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LuArrowRight,
  LuBrain,
  LuMap,
  LuMapPinned,
  LuMessageCircle,
  LuRoute,
  LuShieldCheck,
} from 'react-icons/lu';
import './LandingPage.css';

const LandingPage = () => {
  const navigate = useNavigate();

  const goToGuest = () => navigate('/guest');
  const goToAdmin = () => navigate('/super-admin-login-form');

  return (
    <div className="landing-page">
      <div className="landing-page-background">
        <img src="/bg.jpg" alt="" className="landing-bg-image" />
      </div>

      <main className="landing-shell">
        <section className="landing-hero" aria-label="ALAGAD hero">
          <div className="hero-card">
            <img src="/alagad.png" alt="ALAGAD Logo" className="landing-logo" />
            <div className="hero-copy">
              <p className="hero-kicker">BukSU Campus Navigation and Assistant</p>
              <h1 className="hero-title">ALAGAD</h1>
              <p className="hero-subtitle">Your smart guide to BukSU.</p>
            </div>
          </div>
        </section>

        <section className="main-panels" aria-label="Landing options">
          <article
            className="portal-card portal-card-map"
            role="button"
            tabIndex={0}
            onClick={goToGuest}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') goToGuest();
            }}
          >
            <div className="portal-card-content">
              <div className="portal-heading-row">
                <span className="portal-icon-circle" aria-hidden="true">
                  <LuMap />
                </span>
                <div>
                  <h1 className="portal-title">Public Map View</h1>
                  <span className="title-accent" aria-hidden="true" />
                </div>
              </div>
              <p className="portal-description">
                Explore BukSU&apos;s interactive campus map and quickly locate buildings, offices, rooms, and facilities.
              </p>
              <button className="portal-button portal-button-primary" onClick={(e) => { e.stopPropagation(); goToGuest(); }}>
                <LuMapPinned aria-hidden="true" />
                <span>Explore Map</span>
                <LuArrowRight aria-hidden="true" />
              </button>
            </div>
            <LuMapPinned className="portal-watermark" aria-hidden="true" />
            <span className="card-bottom-wave" aria-hidden="true" />
          </article>

          <article
            className="portal-card portal-card-admin"
            role="button"
            tabIndex={0}
            onClick={goToAdmin}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') goToAdmin();
            }}
          >
            <div className="portal-card-content">
              <div className="portal-heading-row">
                <span className="portal-icon-circle" aria-hidden="true">
                  <LuShieldCheck />
                </span>
                <div>
                  <h1 className="portal-title">Admin Dashboard</h1>
                  <span className="title-accent" aria-hidden="true" />
                </div>
              </div>
              <p className="portal-helper">For authorized personnel only.</p>
              <p className="portal-description">
                Securely manage campus locations, map information, records, and system settings.
              </p>
              <button className="portal-button portal-button-secondary" onClick={(e) => { e.stopPropagation(); goToAdmin(); }}>
                <LuShieldCheck aria-hidden="true" />
                <span>Admin Login</span>
                <LuArrowRight aria-hidden="true" />
              </button>
            </div>
            <LuShieldCheck className="portal-watermark" aria-hidden="true" />
            <span className="card-bottom-wave" aria-hidden="true" />
          </article>
        </section>

        <section className="features-section" aria-label="Key features">
          <h2 className="features-heading"><span>Key Features</span></h2>
          <div className="features-grid">
            <article className="feature-box">
              <div className="feature-box-icon">
                <LuMapPinned aria-hidden="true" />
              </div>
              <div className="feature-copy">
                <h3 className="feature-box-label">Interactive Map</h3>
                <span className="title-accent compact" aria-hidden="true" />
                <p className="feature-box-description">Find campus places with a clear interactive map.</p>
              </div>
              <LuMapPinned className="feature-watermark" aria-hidden="true" />
              <span className="card-bottom-wave" aria-hidden="true" />
            </article>
            <article className="feature-box">
              <div className="feature-box-icon">
                <LuRoute aria-hidden="true" />
              </div>
              <div className="feature-copy">
                <h3 className="feature-box-label">Smart Directions</h3>
                <span className="title-accent compact" aria-hidden="true" />
                <p className="feature-box-description">Follow simple routes to your selected destination.</p>
              </div>
              <LuRoute className="feature-watermark" aria-hidden="true" />
              <span className="card-bottom-wave" aria-hidden="true" />
            </article>
            <article className="feature-box">
              <div className="feature-box-icon">
                <LuBrain aria-hidden="true" />
              </div>
              <div className="feature-copy">
                <h3 className="feature-box-label">AI Assistant</h3>
                <span className="title-accent compact" aria-hidden="true" />
                <p className="feature-box-description">Ask questions and get verified campus information.</p>
              </div>
              <LuMessageCircle className="feature-watermark" aria-hidden="true" />
              <span className="card-bottom-wave" aria-hidden="true" />
            </article>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p className="landing-footer-copy">&copy; 2026 BukSU Campus Navigation and Assistant | ALAGAD</p>
      </footer>
    </div>
  );
};

export default LandingPage;
