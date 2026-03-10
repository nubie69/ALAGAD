import React from 'react';
import '../styles/BuildingPopup.css';

/**
 * BuildingPopup Component
 * Displays a compact popup when a building marker is clicked on the map
 * Shows basic building info and action button to view full details
 */
export const BuildingPopup = ({ 
  building, 
  onViewDetails, 
  isLoading = false 
}) => {
  if (!building) return null;

  const getRoomCount = () => {
    return building.rooms?.length || 0;
  };

  const getOfficeCount = () => {
    return building.offices?.length || 0;
  };

  return (
    <div className="building-popup-card">
      {/* Header with Icon */}
      <div className="popup-header">
        <div className="popup-icon">🏢</div>
        <h3 className="popup-title">{building.name}</h3>
      </div>

      {/* Building Info */}
      <div className="popup-content">
        {building.location && (
          <div className="popup-info-row">
            <span className="popup-label">📍 Location:</span>
            <span className="popup-value">{building.location}</span>
          </div>
        )}
        
        {building.type && (
          <div className="popup-info-row">
            <span className="popup-label">📋 Type:</span>
            <span className="popup-badge">{building.type}</span>
          </div>
        )}

        <div className="popup-stats">
          <div className="stat-item">
            <span className="stat-number">{getRoomCount()}</span>
            <span className="stat-label">Rooms</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{getOfficeCount()}</span>
            <span className="stat-label">Offices</span>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="popup-footer">
        <button
          className="popup-action-btn"
          onClick={onViewDetails}
          disabled={isLoading}
          aria-label={`View full details for ${building.name}`}
        >
          {isLoading ? 'Loading...' : 'View Details'}
        </button>
      </div>
    </div>
  );
};

export default BuildingPopup;
