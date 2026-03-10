import React, { useState, useCallback, useRef, useEffect } from 'react';
import Map, { Marker, Popup } from 'react-map-gl';
import { BuildingPopup } from './BuildingPopup';
import { QuickNavPanel } from './QuickNavPanel';
import { useMapState } from '../context/MapContext';
import '../styles/MapComponent.css';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

/**
 * MapComponent
 * Scalable building information system for campus navigation
 * 
 * Features:
 * - Interactive map with building markers
 * - Click marker → show popup
 * - Click "View Details" → open QuickNavPanel
 * - Mobile responsive design
 * - Smooth transitions & animations
 * - Accessibility support
 */
// Campus boundaries - prevents scrolling outside this area
const CAMPUS_BOUNDS = [[125.1210, 8.1535], [125.1270, 8.1595]];

export const MapComponent = ({ 
  buildings = [],
  onBuildingSelected = null,
  initialCenter = { lat: 8.1574, lng: 125.1248 },
  initialZoom = 17
}) => {
  // GPS location from MapContext (may be null if context is not provided)
  const mapCtx = useMapState?.() ?? {};
  const userLocation = mapCtx.userLocation ?? null;

  // Map state
  const [viewState, setViewState] = useState({
    latitude: initialCenter.lat,
    longitude: initialCenter.lng,
    zoom: initialZoom,
    bearing: 0,
    pitch: 0,
  });

  // Building selection state
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [popupBuilding, setPopupBuilding] = useState(null);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [isPanelLoading, setIsPanelLoading] = useState(false);

  const mapRef = useRef(null);
  const popupRef = useRef(null);

  // Get building coordinates
  const getCoordinates = useCallback((building) => {
    try {
      const geom = building?.geometry;
      if (!geom || !geom.coordinates) return null;

      if (geom.type === 'Point') {
        const [lng, lat] = geom.coordinates;
        if (typeof lng === 'number' && typeof lat === 'number') {
          return { lat, lng };
        }
      }

      if (geom.type === 'Polygon' && Array.isArray(geom.coordinates[0])) {
        const ring = geom.coordinates[0];
        let lngSum = 0, latSum = 0;
        ring.forEach(([lng, lat]) => {
          lngSum += lng;
          latSum += lat;
        });
        return {
          lng: lngSum / ring.length,
          lat: latSum / ring.length,
        };
      }
    } catch (err) {
      console.error('Error getting coordinates:', err);
    }
    return null;
  }, []);

  // Handle marker click - show popup
  const handleMarkerClick = useCallback((building) => {
    const coords = getCoordinates(building);
    if (coords) {
      setPopupBuilding(building);
      // Fly to building
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [coords.lng, coords.lat],
          zoom: 19,
          duration: 1000,
        });
      }
    }
  }, [getCoordinates]);

  // Handle "View Details" button - open panel
  const handleViewDetails = useCallback((building) => {
    setIsPanelLoading(true);
    setSelectedBuilding(building);
    setIsDetailsPanelOpen(true);

    // Simulate loading delay
    setTimeout(() => {
      setIsPanelLoading(false);
    }, 300);
  }, []);

  // Handle close panel
  const handleClosePanel = useCallback(() => {
    setIsDetailsPanelOpen(false);
    // Keep selectedBuilding in state so data persists
  }, []);

  // Handle backdrop click on popup
  const handlePopupClose = useCallback(() => {
    setPopupBuilding(null);
  }, []);

  // When a new building marker is clicked while panel is open
  const handleMarkerClickWithPanelOpen = useCallback((building) => {
    const coords = getCoordinates(building);
    if (coords) {
      setPopupBuilding(building);
      // Update panel with new building
      handleViewDetails(building);
      // Fly to new location
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [coords.lng, coords.lat],
          zoom: 19,
          duration: 1000,
        });
      }
    }
  }, [getCoordinates, handleViewDetails]);

  useEffect(() => {
    if (onBuildingSelected && selectedBuilding) {
      onBuildingSelected(selectedBuilding);
    }
  }, [selectedBuilding, onBuildingSelected]);

  return (
    <div className="map-component-container">
      {/* Map Area */}
      <div className="map-wrapper">
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          mapboxAccessToken={MAPBOX_TOKEN}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/outdoors-v12"
          maxBounds={CAMPUS_BOUNDS}
          minZoom={16}
          maxZoom={20}
        >

          {/* Building Markers */}
          {buildings.map((building) => {
            const coords = getCoordinates(building);
            if (!coords) return null;

            const isSelected = selectedBuilding?._id === building._id && isDetailsPanelOpen;

            return (
              <React.Fragment key={building._id || building.name}>
                <Marker
                  longitude={coords.lng}
                  latitude={coords.lat}
                  anchor="bottom"
                  onClick={() => 
                    isDetailsPanelOpen 
                      ? handleMarkerClickWithPanelOpen(building)
                      : handleMarkerClick(building)
                  }
                >
                  <div 
                    className={`map-marker ${isSelected ? 'selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Building: ${building.name}`}
                  >
                    🏢
                  </div>
                </Marker>
              </React.Fragment>
            );
          })}

          {/* Popup shown on marker click */}
          {popupBuilding && (
            <Popup
              longitude={getCoordinates(popupBuilding)?.lng}
              latitude={getCoordinates(popupBuilding)?.lat}
              anchor="bottom"
              offset={[0, -40]}
              onClose={handlePopupClose}
              closeButton={false}
            >
              <BuildingPopup
                building={popupBuilding}
                onViewDetails={() => handleViewDetails(popupBuilding)}
              />
            </Popup>
          )}
        </Map>

        {/* Map Controls Hint */}
        <div className="map-controls-hint">
          <p>Click on markers to view building details</p>
        </div>
      </div>

      {/* Detail Panel - Slide in from right */}
      <QuickNavPanel
        building={selectedBuilding}
        isOpen={isDetailsPanelOpen}
        onClose={handleClosePanel}
        isLoading={isPanelLoading}
      />
    </div>
  );
};

export default MapComponent;
