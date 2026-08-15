import React, { useState, useMemo, useEffect } from 'react';
import { Marker, Popup } from 'react-map-gl';
import BuildingPinMarker from './BuildingPinMarker';

/**
 * BuildingMarkers
 * Renders public-facing building pins from Building.geometry.
 */

const getCoordinates = (building) => {
  try {
    const geom = building?.geometry;
    if (!geom || !geom.coordinates) return null;
    if (geom.type === 'Point') {
      const [lng, lat] = geom.coordinates;
      if (typeof lng === 'number' && typeof lat === 'number') return { lat, lng };
    }
    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates[0])) {
      const ring = geom.coordinates[0];
      let lngSum = 0, latSum = 0;
      ring.forEach(([lng, lat]) => { lngSum += lng; latSum += lat; });
      return { lng: lngSum / ring.length, lat: latSum / ring.length };
    }
  } catch (err) {
    console.error('Error getting coordinates:', err);
  }
  return null;
};

export const BuildingMarkers = ({ 
  buildings = [], 
  selectedBuildingId = null,
  isNavigating = false,
  navigationTarget = null,
  blurMarkers = false,
  suppressNavTargetPin = false,
  onMarkerClick = null,
  onViewDetails = null,
  onPopupClose = null,
  onNavigate = null,
}) => {
  const [popupInfo, setPopupInfo] = useState(null);

  useEffect(() => {
    if (blurMarkers && popupInfo) {
      setPopupInfo(null);
    }
  }, [blurMarkers, popupInfo]);

  const validBuildings = useMemo(() => (
    buildings
      .map(b => ({ ...b, coords: getCoordinates(b) }))
      .filter(b => b.coords !== null)
  ), [buildings]);

  if (!validBuildings.length) return null;

  return (
    <>
      {validBuildings.map((building) => {
        const isSelected = selectedBuildingId === building._id || popupInfo?._id === building._id;
        const isNavTarget = isNavigating && navigationTarget === building.name;
        const showNavTargetPin = isNavTarget && !suppressNavTargetPin;
        const pinColor = building.pinColor || building.markerColor || building.color || '#D93025';

        return (
          <React.Fragment key={building._id || building.name}>
            <Marker
              longitude={building.coords.lng}
              latitude={building.coords.lat}
              anchor="bottom"
              rotation={0}
              rotationAlignment="viewport"
              pitchAlignment="viewport"
              onClick={(e) => {
                if (blurMarkers) return;
                e.originalEvent.stopPropagation();
                setPopupInfo(building);
                onMarkerClick?.(building);
              }}
            >
              <div className={blurMarkers && !isSelected ? 'secondary-nav-marker secondary-nav-marker--blurred' : 'secondary-nav-marker'}>
                <BuildingPinMarker
                  label={building.name}
                  color={pinColor}
                  highlighted={isSelected || showNavTargetPin}
                  dimmed={blurMarkers && !isSelected}
                />
              </div>
            </Marker>

            {popupInfo?._id === building._id && !blurMarkers && (
              <Popup
                longitude={building.coords.lng}
                latitude={building.coords.lat}
                anchor="top"
                onClose={() => { setPopupInfo(null); onPopupClose?.(); }}
                closeButton={true}
                closeOnClick={false}
                offset={[0, 8]}
              >
                <div style={{ padding: '12px', minWidth: '200px', maxWidth: '280px' }}>
                  {/* Building image */}
                  {building.image && (
                    <div style={{
                      width: '100%',
                      height: '140px',
                      marginBottom: '10px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: '#f3f4f6',
                    }}>
                      <img
                        src={building.image}
                        alt={building.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '999px', backgroundColor: pinColor, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1f2937' }}>
                      {building.name}
                    </h3>
                  </div>

                  {building.description && (
                    <p style={{ margin: '6px 0', fontSize: '13px', color: '#666', lineHeight: '1.5' }}>
                      {building.description}
                    </p>
                  )}

                  {building.location && (
                    <div style={{ margin: '8px 0 0', padding: '8px 0 0', borderTop: '1px solid #e5e7eb', fontSize: '12px', color: '#6b7280' }}>
                      <strong>Location:</strong> {building.location}
                    </div>
                  )}

                  <button
                    onClick={() => { onNavigate?.(building, building.name); setPopupInfo(null); }}
                    style={{
                      width: '100%', marginTop: '12px', padding: '10px 12px',
                      background: '#16a34a', color: 'white', border: 'none',
                      borderRadius: '6px', fontSize: '14px', fontWeight: '600',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#15803d'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#16a34a'; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
                    Navigate Here
                  </button>
                  <button
                    onClick={() => { onViewDetails?.(building); setPopupInfo(null); }}
                    style={{
                      width: '100%', marginTop: '8px', padding: '10px 12px',
                      background: '#2F6DE1', color: 'white', border: 'none',
                      borderRadius: '6px', fontSize: '14px', fontWeight: '600',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#2557B8'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#2F6DE1'; }}
                  >
                    View More Details →
                  </button>
                </div>
              </Popup>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

export default BuildingMarkers;
