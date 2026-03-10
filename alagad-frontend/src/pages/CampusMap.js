import React, { useState, useEffect } from 'react';
import { MapComponent } from '../components/MapComponent';
import { buildingsAPI } from '../utils/api';
import '../styles/CampusMap.css';

/**
 * CampusMap Page
 * Example implementation of the Building Information System
 * 
 * Features:
 * - Loads buildings from API
 * - Manages selected building state
 * - Handles building selection callbacks
 * - Responsive layout
 */
function CampusMap() {
  const [buildings, setBuildings] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch buildings on mount
  useEffect(() => {
    const fetchBuildings = async () => {
      try {
        setIsLoading(true);
        const data = await buildingsAPI.getAll();
        setBuildings(data || []);
      } catch (err) {
        setError(err.message || 'Failed to load buildings');
        console.error('Error fetching buildings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBuildings();
  }, []);

  // Handle building selection
  const handleBuildingSelected = (building) => {
    setSelectedBuilding(building);
    console.log('Building selected:', building.name);
  };

  if (error) {
    return (
      <div className="campus-map-error">
        <p>Error loading campus map: {error}</p>
      </div>
    );
  }

  return (
    <div className="campus-map-container">
      {isLoading && (
        <div className="campus-map-loading">
          <div className="loading-spinner"></div>
          <p>Loading campus map...</p>
        </div>
      )}

      <MapComponent
        buildings={buildings}
        onBuildingSelected={handleBuildingSelected}
        initialCenter={{ lat: 8.1574, lng: 125.1248 }}
        initialZoom={17}
      />

      {/* Optional: Info Section */}
      {selectedBuilding && (
        <div className="building-info-toast">
          <p>Selected: <strong>{selectedBuilding.name}</strong></p>
        </div>
      )}
    </div>
  );
}

export default CampusMap;
