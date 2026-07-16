import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import Map, { Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapState } from '../context/MapContext';
import { buildingsAPI, officesAPI, mapAPI } from '../utils/api';
import SafeGeoJSON from './SafeGeoJSON';
import { BoxMarker } from './BoxMarker';
import './MapEditor.css';

const BUKSU_CAMPUS = {
  center: { lat: 8.156363, lng: 125.124143 },
  zoom: 17.75,
};

// Campus boundaries - prevents scrolling outside this area
const CAMPUS_BOUNDS = [[125.1210, 8.1535], [125.1270, 8.1595]];

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

// Pin color based on type/name
const getPinColor = (item, type) => {
  if (type === 'office') return '#8b5cf6';
  const name = (item.name || '').toLowerCase();
  if (name.includes('admin') || name.includes('registrar')) return '#8b5cf6';
  if (name.includes('library') || name.includes('cafeteria') || name.includes('gym')) return '#10b981';
  if (name.includes('dorm') || name.includes('residential')) return '#f59e0b';
  return '#3b82f6';
};

function MapEditor() {
  const { mapFeatures, refreshMapFeatures } = useMapState();
  const mapRef = useRef(null);

  // Data
  const [buildings, setBuildings] = useState([]);
  const [offices, setOffices] = useState([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('buildings');
  const [searchQuery, setSearchQuery] = useState('');

  // Pin placement mode
  const [placingPin, setPlacingPin] = useState(null);
  const [tempPin, setTempPin] = useState(null);

  // Selected marker + live-edit state (inline panel, no modal)
  const [selectedPin, setSelectedPin] = useState(null);   // { ...item, pinType }
  const [liveEdit, setLiveEdit] = useState({ rotation: 0, color: '#569ec2', name: '', description: '' });

  // Map view
  const [viewState, setViewState] = useState({
    longitude: BUKSU_CAMPUS.center.lng,
    latitude: BUKSU_CAMPUS.center.lat,
    zoom: BUKSU_CAMPUS.zoom,
    bearing: -140.75,
    pitch: 0,
  });

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [buildingsData, officesData] = await Promise.all([
        buildingsAPI.getAll().catch(() => []),
        officesAPI.getAll().catch(() => []),
      ]);
      setBuildings(buildingsData);
      setOffices(officesData);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Show notification
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Map load handler
  const onMapLoad = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    if (map.isStyleLoaded()) {
      setMapStyleLoaded(true);
    } else {
      map.on('style.load', () => setMapStyleLoaded(true));
    }
  }, []);

  // Get coordinates from geometry
  const getCoords = useCallback((item) => {
    const geom = item?.geometry;
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
    return null;
  }, []);

  // Buildings and offices with/without pins
  const buildingsWithPins = useMemo(() => buildings.filter(b => getCoords(b)), [buildings, getCoords]);
  const officesWithPins = useMemo(() => offices.filter(o => getCoords(o)), [offices, getCoords]);

  // Filtered lists
  const query = searchQuery.trim().toLowerCase();
  const filteredBuildings = useMemo(() => {
    if (!query) return buildings;
    return buildings.filter(b => b.name?.toLowerCase().includes(query) || b.location?.toLowerCase().includes(query));
  }, [buildings, query]);

  const filteredOffices = useMemo(() => {
    if (!query) return offices;
    return offices.filter(o => o.name?.toLowerCase().includes(query) || o.building?.name?.toLowerCase().includes(query));
  }, [offices, query]);

  // Valid GeoJSON features (polygons only - points handled by markers)
  const validFeatures = useMemo(() => ({
    type: 'FeatureCollection',
    features: (mapFeatures?.features || []).filter(f => {
      try {
        const geom = f?.geometry;
        if (!geom || !geom.coordinates) return false;
        if (geom.type === 'Point') return false;
        return true;
      } catch { return false; }
    }),
  }), [mapFeatures]);

  // Handle map click for pin placement
  const handleMapClick = useCallback((e) => {
    if (!placingPin) return;
    const { lng, lat } = e.lngLat;
    setTempPin({ lng, lat });
  }, [placingPin]);

  // Start placing pin for an item
  const startPlacingPin = (item, type) => {
    setPlacingPin({ id: item._id, name: item.name, type });
    setTempPin(null);
    setSelectedPin(null);
    showNotification(`Click on the map to place pin for "${item.name}"`, 'info');
  };

  // Cancel pin placement
  const cancelPlacing = () => {
    setPlacingPin(null);
    setTempPin(null);
  };

  // Save pin placement
  const savePin = async () => {
    if (!placingPin || !tempPin) return;
    try {
      setSaving(true);
      const geometry = {
        type: 'Point',
        coordinates: [tempPin.lng, tempPin.lat],
      };
      await mapAPI.setPin(placingPin.id, placingPin.type, geometry);
      await Promise.all([loadData(), refreshMapFeatures()]);
      showNotification(`Pin placed for "${placingPin.name}"`);
      setPlacingPin(null);
      setTempPin(null);
    } catch (err) {
      showNotification(err.message || 'Failed to save pin', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Remove pin from item
  const removePin = async (item, type) => {
    if (!window.confirm(`Remove the map pin from "${item.name}"?`)) return;
    try {
      setSaving(true);
      await mapAPI.removePin(item._id, type);
      await Promise.all([loadData(), refreshMapFeatures()]);
      showNotification(`Pin removed from "${item.name}"`);
      setSelectedPin(null);
    } catch (err) {
      showNotification(err.message || 'Failed to remove pin', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Open inline properties panel for a marker
  const openEditPanel = (item, type) => {
    setSelectedPin({ ...item, pinType: type });
    setLiveEdit({
      name: item.name || '',
      description: item.description || '',
      color: item.markerColor || item.color || getPinColor(item, type),
      rotation: typeof item.rotation === 'number' ? item.rotation : 0,
    });
    setPlacingPin(null);
  };

  // Save live-edited properties to DB
  const saveEditedPin = async () => {
    if (!selectedPin) return;
    try {
      setSaving(true);
      const updateData = {
        name: liveEdit.name.trim(),
        description: liveEdit.description.trim(),
        markerColor: liveEdit.color,
        color: liveEdit.color,
        rotation: Number(liveEdit.rotation),
      };
      if (selectedPin.pinType === 'building') {
        await buildingsAPI.update(selectedPin._id, {
          ...updateData,
          location: selectedPin.location || liveEdit.name.trim(),
        });
      } else {
        await officesAPI.update(selectedPin._id, {
          ...updateData,
          building: selectedPin.building?._id || selectedPin.building,
          floor: selectedPin.floor,
          department: selectedPin.department,
        });
      }
      await Promise.all([loadData(), refreshMapFeatures()]);
      showNotification(`"${liveEdit.name}" saved`);
      setSelectedPin(null);
    } catch (err) {
      showNotification(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Relocate pin
  const relocatePin = (item, type) => {
    setPlacingPin({ id: item._id, name: item.name, type });
    setTempPin(null);
    setSelectedPin(null);
    showNotification(`Click on the map to move pin for "${item.name}"`, 'info');
  };

  // Fly to pin
  const flyToPin = (item) => {
    const coords = getCoords(item);
    if (coords) {
      setViewState(prev => ({ ...prev, longitude: coords.lng, latitude: coords.lat, zoom: 19 }));
    }
  };

  return (
    <div className="me-container">
      {/* Notification Toast */}
      {notification && (
        <div className={`me-toast me-toast--${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* Pin Placement Bar */}
      {placingPin && (
        <div className="me-placement-bar">
          <span>
            {tempPin
              ? <>Pin placed at <strong>{tempPin.lat.toFixed(5)}, {tempPin.lng.toFixed(5)}</strong> — drag to adjust</>
              : <>Click on the map to place <strong>{placingPin.name}</strong></>
            }
          </span>
          <div className="me-placement-actions">
            {tempPin && (
              <button className="me-btn me-btn--save" onClick={savePin} disabled={saving}>
                {saving ? 'Saving...' : 'Confirm'}
              </button>
            )}
            <button className="me-btn me-btn--cancel" onClick={cancelPlacing}>Cancel</button>
          </div>
        </div>
      )}

      <div className="me-layout">
        {/* ── Left Sidebar ── */}
        <aside className="me-sidebar">
          <div className="me-sidebar-header">
            <h3 className="me-sidebar-title">Map Markers</h3>
            <span className="me-pin-count">
              {buildingsWithPins.length + officesWithPins.length} pinned
            </span>
          </div>

          <div className="me-search">
            <input
              type="text"
              placeholder="Search buildings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="me-search-input"
            />
          </div>

          <div className="me-tabs">
            <button
              className={`me-tab ${activeTab === 'buildings' ? 'me-tab--active' : ''}`}
              onClick={() => setActiveTab('buildings')}
            >
              Buildings <span className="me-tab-count">({buildings.length})</span>
            </button>
            <button
              className={`me-tab ${activeTab === 'offices' ? 'me-tab--active' : ''}`}
              onClick={() => setActiveTab('offices')}
            >
              Offices <span className="me-tab-count">({offices.length})</span>
            </button>
          </div>

          <div className="me-list">
            {activeTab === 'buildings' && (
              <>
                {filteredBuildings.filter(b => getCoords(b)).map((building) => {
                  const bColor = building.markerColor || building.color || getPinColor(building, 'building');
                  const bRot = typeof building.rotation === 'number' ? building.rotation : 0;
                  const isActive = selectedPin?._id === building._id;
                  return (
                    <div
                      key={building._id}
                      className={`me-list-item ${isActive ? 'me-list-item--active' : ''}`}
                      onClick={() => { flyToPin(building); openEditPanel(building, 'building'); }}
                    >
                      <span className="me-list-swatch" style={{ backgroundColor: bColor }} />
                      <div className="me-list-item-info">
                        <span className="me-list-item-name">{building.name}</span>
                        <span className="me-list-item-meta">
                          {bRot !== 0 && <span className="me-list-rotation">{bRot}°</span>}
                          {building.location || ''}
                        </span>
                      </div>
                      <div className="me-list-item-actions">
                        <button className="me-icon-btn" onClick={(e) => { e.stopPropagation(); relocatePin(building, 'building'); }} title="Move pin">⇄</button>
                        <button className="me-icon-btn me-icon-btn--danger" onClick={(e) => { e.stopPropagation(); removePin(building, 'building'); }} title="Remove pin">✕</button>
                      </div>
                    </div>
                  );
                })}

                {filteredBuildings.filter(b => !getCoords(b)).length > 0 && (
                  <div className="me-list-divider">Without Pins</div>
                )}
                {filteredBuildings.filter(b => !getCoords(b)).map((building) => (
                  <div key={building._id} className="me-list-item me-list-item--unpinned">
                    <span className="me-list-swatch me-list-swatch--empty" />
                    <div className="me-list-item-info">
                      <span className="me-list-item-name">{building.name}</span>
                    </div>
                    <button className="me-btn me-btn--small" onClick={() => startPlacingPin(building, 'building')}>
                      + Pin
                    </button>
                  </div>
                ))}

                {filteredBuildings.length === 0 && (
                  <div className="me-list-empty">No buildings found</div>
                )}
              </>
            )}

            {activeTab === 'offices' && (
              <>
                {filteredOffices.filter(o => getCoords(o)).map((office) => {
                  const oColor = office.markerColor || office.color || getPinColor(office, 'office');
                  const oRot = typeof office.rotation === 'number' ? office.rotation : 0;
                  const isActive = selectedPin?._id === office._id;
                  return (
                    <div
                      key={office._id}
                      className={`me-list-item ${isActive ? 'me-list-item--active' : ''}`}
                      onClick={() => { flyToPin(office); openEditPanel(office, 'office'); }}
                    >
                      <span className="me-list-swatch" style={{ backgroundColor: oColor }} />
                      <div className="me-list-item-info">
                        <span className="me-list-item-name">{office.name}</span>
                        <span className="me-list-item-meta">
                          {oRot !== 0 && <span className="me-list-rotation">{oRot}°</span>}
                          {office.building?.name || ''}
                        </span>
                      </div>
                      <div className="me-list-item-actions">
                        <button className="me-icon-btn" onClick={(e) => { e.stopPropagation(); relocatePin(office, 'office'); }} title="Move pin">⇄</button>
                        <button className="me-icon-btn me-icon-btn--danger" onClick={(e) => { e.stopPropagation(); removePin(office, 'office'); }} title="Remove pin">✕</button>
                      </div>
                    </div>
                  );
                })}

                {filteredOffices.filter(o => !getCoords(o)).length > 0 && (
                  <div className="me-list-divider">Without Pins</div>
                )}
                {filteredOffices.filter(o => !getCoords(o)).map((office) => (
                  <div key={office._id} className="me-list-item me-list-item--unpinned">
                    <span className="me-list-swatch me-list-swatch--empty" />
                    <div className="me-list-item-info">
                      <span className="me-list-item-name">{office.name}</span>
                    </div>
                    <button className="me-btn me-btn--small" onClick={() => startPlacingPin(office, 'office')}>
                      + Pin
                    </button>
                  </div>
                ))}

                {filteredOffices.length === 0 && (
                  <div className="me-list-empty">No offices found</div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* ── Map Area ── */}
        <div className="me-map-area">
          <Map
            ref={mapRef}
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            onClick={handleMapClick}
            mapboxAccessToken={MAPBOX_TOKEN}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/zach-2002/cmmfqzvkr000w01sp0vw694hy"
            maxBounds={CAMPUS_BOUNDS}
            minZoom={16}
            maxZoom={20}
            onLoad={onMapLoad}
            cursor={placingPin ? 'crosshair' : 'grab'}
          >
            {/* Polygon features */}
            {mapStyleLoaded && validFeatures.features.length > 0 && (
              <SafeGeoJSON data={validFeatures} />
            )}

            {/* Building markers */}
            {mapStyleLoaded && buildingsWithPins.map((b) => {
              const coords = getCoords(b);
              if (!coords) return null;
              const isSelected = selectedPin?._id === b._id;
              const color = isSelected ? liveEdit.color : (b.markerColor || b.color || getPinColor(b, 'building'));
              const rotation = isSelected ? liveEdit.rotation : (typeof b.rotation === 'number' ? b.rotation : 0);
              return (
                <Marker key={`building-${b._id}`} longitude={coords.lng} latitude={coords.lat} anchor="center"
                  onClick={(e) => { e.originalEvent.stopPropagation(); flyToPin(b); openEditPanel(b, 'building'); }}
                >
                  <BoxMarker name={b.name} color={color} isSelected={isSelected} />
                </Marker>
              );
            })}

            {/* Office markers */}
            {mapStyleLoaded && officesWithPins.map((o) => {
              const coords = getCoords(o);
              if (!coords) return null;
              const isSelected = selectedPin?._id === o._id;
              const color = isSelected ? liveEdit.color : (o.markerColor || o.color || getPinColor(o, 'office'));
              const rotation = isSelected ? liveEdit.rotation : (typeof o.rotation === 'number' ? o.rotation : 0);
              return (
                <Marker key={`office-${o._id}`} longitude={coords.lng} latitude={coords.lat} anchor="center"
                  onClick={(e) => { e.originalEvent.stopPropagation(); flyToPin(o); openEditPanel(o, 'office'); }}
                >
                  <BoxMarker name={o.name} color={color} isSelected={isSelected} />
                </Marker>
              );
            })}

            {/* Temp marker during placement */}
            {mapStyleLoaded && tempPin && (
              <Marker longitude={tempPin.lng} latitude={tempPin.lat} anchor="center" draggable
                onDragEnd={(e) => setTempPin({ lng: e.lngLat.lng, lat: e.lngLat.lat })}
              >
                <BoxMarker name={placingPin?.name || 'New Pin'} color="#f59e0b" />
              </Marker>
            )}
          </Map>

          {/* ── Floating Property Card (appears on selection) ── */}
          {selectedPin && (
            <div className="me-prop-card">
              <div className="me-prop-card-header">
                <h4 className="me-prop-card-title">{selectedPin.name}</h4>
                <button className="me-prop-card-close" onClick={() => setSelectedPin(null)}>✕</button>
              </div>

              <div className="me-prop-card-body">
                {/* Color */}
                <div className="me-prop-field">
                  <span className="me-prop-field-label">Pin Color</span>
                  <div className="me-prop-color-controls">
                    <div className="me-color-grid">
                      {[
                        { color: '#569ec2', name: 'Ocean Blue' },
                        { color: '#3b82f6', name: 'Sky Blue' },
                        { color: '#8b5cf6', name: 'Purple' },
                        { color: '#10b981', name: 'Green' },
                        { color: '#f59e0b', name: 'Amber' },
                        { color: '#ef4444', name: 'Red' },
                        { color: '#ec4899', name: 'Pink' },
                        { color: '#64748b', name: 'Gray' },
                      ].map(({ color, name }) => (
                        <button
                          key={color}
                          className={`me-color-option ${liveEdit.color === color ? 'me-color-option--active' : ''}`}
                          onClick={() => setLiveEdit(prev => ({ ...prev, color }))}
                          title={name}
                        >
                          <span className="me-color-preview" style={{ backgroundColor: color }} />
                          <span className="me-color-name">{name}</span>
                          {liveEdit.color === color && <span className="me-color-check">✓</span>}
                        </button>
                      ))}
                    </div>
                    <div className="me-color-custom">
                      <label className="me-color-custom-label">
                        <span>Custom Color</span>
                        <input
                          type="color"
                          value={liveEdit.color}
                          onChange={(e) => setLiveEdit(prev => ({ ...prev, color: e.target.value }))}
                          className="me-color-input"
                        />
                      </label>
                      <span className="me-color-hex">{liveEdit.color.toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                {/* Rotation */}
                <div className="me-prop-field">
                  <div className="me-prop-field-label">
                    Rotation
                    <span className="me-prop-field-value">{liveEdit.rotation}°</span>
                  </div>
                  <div className="me-prop-slider-row">
                    <input
                      type="range"
                      className="me-range"
                      min="0" max="360" step="1"
                      value={liveEdit.rotation}
                      onChange={(e) => setLiveEdit(prev => ({ ...prev, rotation: parseInt(e.target.value) }))}
                    />
                    <button
                      className="me-btn-reset"
                      onClick={() => setLiveEdit(prev => ({ ...prev, rotation: 0 }))}
                    >0°</button>
                  </div>
                </div>

                {/* Live Preview */}
                <div className="me-prop-preview">
                  <BoxMarker name={selectedPin.name} color={liveEdit.color} isSelected />
                </div>
              </div>

              <div className="me-prop-card-footer">
                <button className="me-btn me-btn--ghost me-btn--danger-text"
                  onClick={() => removePin(selectedPin, selectedPin.pinType)}
                >Remove</button>
                <div className="me-prop-card-footer-right">
                  <button className="me-btn me-btn--ghost"
                    onClick={() => relocatePin(selectedPin, selectedPin.pinType)}
                  >Move</button>
                  <button className="me-btn me-btn--ghost" onClick={() => setSelectedPin(null)}>Cancel</button>
                  <button className="me-btn me-btn--primary" onClick={saveEditedPin} disabled={saving}>
                    {saving ? 'Saving…' : 'Done'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Saving indicator */}
          {saving && (
            <div className="me-saving-indicator">
              <div className="me-saving-spinner" />
              Saving…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MapEditor;