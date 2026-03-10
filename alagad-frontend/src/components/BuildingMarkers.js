import React, { useState, useMemo } from 'react';
import { Marker, Popup } from 'react-map-gl';
import { BoxMarker } from './BoxMarker';

/**
 * BuildingMarkers
 * Renders box-style markers (matching the admin MapEditor style) for the guest view.
 * Color and rotation come from saved building.markerColor / building.rotation data.
 */

const DEFAULT_COLORS = {
  building:    '#3b82f6',
  admin:       '#8b5cf6',
  facility:    '#10b981',
  residential: '#f59e0b',
};

const getFallbackColor = (building) => {
  const name = (building.name || '').toLowerCase();
  if (name.includes('admin') || name.includes('registrar') || name.includes('office')) return DEFAULT_COLORS.admin;
  if (name.includes('library') || name.includes('cafeteria') || name.includes('gym') || name.includes('gymnasium')) return DEFAULT_COLORS.facility;
  if (name.includes('dorm') || name.includes('residential')) return DEFAULT_COLORS.residential;
  return DEFAULT_COLORS.building;
};

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
  onMarkerClick = null,
  onViewDetails = null,
  onPopupClose = null,
  onNavigate = null,
}) => {
  const [popupInfo, setPopupInfo] = useState(null);

  const validBuildings = useMemo(() => (
    buildings
      .map(b => ({ ...b, coords: getCoordinates(b) }))
      .filter(b => b.coords !== null)
  ), [buildings]);

  if (!validBuildings.length) return null;

  return (
    <>
      {validBuildings.map((building) => {
        const color    = building.markerColor || building.color || getFallbackColor(building);
        const rotation = typeof building.rotation === 'number' ? building.rotation : 0;
        const isSelected = selectedBuildingId === building._id || popupInfo?._id === building._id;
        const isNavTarget = isNavigating && navigationTarget === building.name;

        return (
          <React.Fragment key={building._id || building.name}>
            <Marker
              longitude={building.coords.lng}
              latitude={building.coords.lat}
              anchor={isNavTarget ? 'bottom' : 'center'}
              rotation={0}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setPopupInfo(building);
                onMarkerClick?.(building);
              }}
            >
              {isNavTarget ? (
                /* Destination pin when navigating to this building */
                <svg width="36" height="46" viewBox="0 0 32 42" fill="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>
                  <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z" fill={color}/>
                  <circle cx="16" cy="16" r="7" fill="#fff"/>
                  <circle cx="16" cy="16" r="3.5" fill={color}/>
                </svg>
              ) : (
                <BoxMarker
                  name={building.name}
                  color={color}
                  isSelected={isSelected}
                />
              )}
            </Marker>

            {popupInfo?._id === building._id && (
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
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: color, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
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
