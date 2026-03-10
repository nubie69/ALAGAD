import React, { useEffect } from 'react';
import '../styles/QuickNavPanel.css';

/**
 * QuickNavPanel Component
 * Detailed building information panel that slides in from the right
 * Shows full details: rooms, offices, departments, facilities
 * Controlled by isOpen boolean prop
 */
export const QuickNavPanel = ({ 
  building, 
  isOpen, 
  onClose,
  isLoading = false 
}) => {
  // Close panel on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Close panel when clicking outside
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="quick-nav-backdrop"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div 
        className={`quick-nav-panel ${isOpen ? 'open' : 'closed'}`}
        role="dialog"
        aria-modal="true"
        aria-label={building ? `Details for ${building.name}` : 'Building details'}
      >
        {/* Header */}
        <div className="panel-header">
          <div className="panel-title-section">
            <h2 className="panel-title">
              🏢 {building?.name || 'Loading...'}
            </h2>
            {building?.type && (
              <span className="panel-subtitle">{building.type}</span>
            )}
          </div>
          <button
            className="panel-close-btn"
            onClick={onClose}
            aria-label="Close building details panel"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="panel-content">
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading building details...</p>
            </div>
          ) : building ? (
            <>
              {/* Basic Info Section */}
              <section className="info-section">
                <h3 className="section-title">📍 Location & Info</h3>
                <div className="info-grid">
                  {building.location && (
                    <div className="info-item">
                      <span className="info-label">Address:</span>
                      <span className="info-value">{building.location}</span>
                    </div>
                  )}
                  {building.numberOfFloors && (
                    <div className="info-item">
                      <span className="info-label">Floors:</span>
                      <span className="info-value">{building.numberOfFloors}</span>
                    </div>
                  )}
                  {building.department && (
                    <div className="info-item">
                      <span className="info-label">Department:</span>
                      <span className="info-value">{building.department}</span>
                    </div>
                  )}
                  {building.status && (
                    <div className="info-item">
                      <span className="info-label">Status:</span>
                      <span className={`status-badge status-${building.status.toLowerCase()}`}>
                        {building.status}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* Rooms Section */}
              {building.rooms && building.rooms.length > 0 && (
                <section className="info-section">
                  <h3 className="section-title">🚪 Rooms ({building.rooms.length})</h3>
                  <div className="list-container">
                    {building.rooms.slice(0, 5).map((room, idx) => (
                      <div key={room._id || idx} className="list-item">
                        <div className="item-name">{room.name}</div>
                        {room.floor && (
                          <span className="item-meta">Floor {room.floor}</span>
                        )}
                        {room.capacity && (
                          <span className="item-meta">Cap: {room.capacity}</span>
                        )}
                      </div>
                    ))}
                    {building.rooms.length > 5 && (
                      <div className="list-more">
                        +{building.rooms.length - 5} more rooms
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Offices Section */}
              {building.offices && building.offices.length > 0 && (
                <section className="info-section">
                  <h3 className="section-title">💼 Offices ({building.offices.length})</h3>
                  <div className="list-container">
                    {building.offices.slice(0, 5).map((office, idx) => (
                      <div key={office._id || idx} className="list-item">
                        <div className="item-name">{office.name}</div>
                        {office.floor && (
                          <span className="item-meta">Floor {office.floor}</span>
                        )}
                        {office.head && (
                          <span className="item-meta">Head: {office.head}</span>
                        )}
                      </div>
                    ))}
                    {building.offices.length > 5 && (
                      <div className="list-more">
                        +{building.offices.length - 5} more offices
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Departments Section */}
              {building.department && (
                <section className="info-section">
                  <h3 className="section-title">🏛️ Department</h3>
                  <div className="department-card">
                    <p className="department-name">{building.department}</p>
                  </div>
                </section>
              )}

              {/* Additional Info Section */}
              {building.description && (
                <section className="info-section">
                  <h3 className="section-title">ℹ️ Description</h3>
                  <p className="description-text">{building.description}</p>
                </section>
              )}

              {/* Action Buttons */}
              <section className="action-section">
                <button className="action-btn primary">
                  📍 View on Map
                </button>
                <button className="action-btn secondary">
                  📞 Get Directions
                </button>
              </section>
            </>
          ) : (
            <div className="empty-state">
              <p>No building selected</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default QuickNavPanel;
