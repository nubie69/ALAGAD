import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapState } from '../context/MapContext';
import { buildingsAPI, officesAPI, mapAPI } from '../utils/api';
import SafeGeoJSON from './SafeGeoJSON';
import MapTrees from './MapTrees';
import BuildingPinMarker from './BuildingPinMarker';
import grassGeoJSON from '../data/grass.json';
import './MapEditor.css';

const BUKSU_CAMPUS = {
  center: { lat: 8.156970, lng: 125.124425 },
  zoom: 19.10,
  pitch: 0.00,
  bearing: -137.68,
};

const CAMPUS_BOUNDS = [[125.1224864, 8.1545658], [125.1261435, 8.1580756]];
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
const DEFAULT_BUILDING_PIN_COLOR = '#D93025';
const DEFAULT_OFFICE_PIN_COLOR = '#8B5CF6';
const PIN_PALETTE = [
  { color: '#D93025', name: 'Red' },
  { color: '#2563EB', name: 'Blue' },
  { color: '#16A34A', name: 'Green' },
  { color: '#EA580C', name: 'Orange' },
  { color: '#7C3AED', name: 'Purple' },
  { color: '#0F766E', name: 'Teal' },
  { color: '#CA8A04', name: 'Gold' },
  { color: '#1D4ED8', name: 'Dark Blue' },
];

const formatCoord = (value, digits = 6) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : '';
};

const parseCoord = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const getPinColor = (item, type) => {
  if (type === 'office') {
    return item?.pinColor || item?.markerColor || item?.color || DEFAULT_OFFICE_PIN_COLOR;
  }
  return item?.pinColor || item?.markerColor || item?.color || DEFAULT_BUILDING_PIN_COLOR;
};

function MapEditor() {
  const { mapFeatures, refreshMapFeatures } = useMapState();
  const mapRef = useRef(null);

  const [buildings, setBuildings] = useState([]);
  const [offices, setOffices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('buildings');
  const [searchQuery, setSearchQuery] = useState('');
  const [placingPin, setPlacingPin] = useState(null);
  const [tempPin, setTempPin] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [liveEdit, setLiveEdit] = useState({
    color: DEFAULT_BUILDING_PIN_COLOR,
    name: '',
    description: '',
    latitude: '',
    longitude: '',
  });
  const [viewState, setViewState] = useState({
    longitude: BUKSU_CAMPUS.center.lng,
    latitude: BUKSU_CAMPUS.center.lat,
    zoom: BUKSU_CAMPUS.zoom,
    bearing: BUKSU_CAMPUS.bearing,
    pitch: BUKSU_CAMPUS.pitch,
  });

  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    window.setTimeout(() => setNotification(null), 3000);
  }, []);

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

  const onMapLoad = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    if (map.isStyleLoaded()) {
      setMapStyleLoaded(true);
    } else {
      map.on('style.load', () => setMapStyleLoaded(true));
    }
  }, []);

  const getCoords = useCallback((item) => {
    const geom = item?.geometry;
    if (!geom || !geom.coordinates) return null;

    if (geom.type === 'Point') {
      const [lng, lat] = geom.coordinates;
      if (typeof lng === 'number' && typeof lat === 'number') return { lat, lng };
    }

    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
      const ring = geom.coordinates[0];
      let lngSum = 0;
      let latSum = 0;
      ring.forEach(([lng, lat]) => {
        lngSum += lng;
        latSum += lat;
      });
      return { lng: lngSum / ring.length, lat: latSum / ring.length };
    }

    return null;
  }, []);

  const validFeatures = useMemo(() => ({
    type: 'FeatureCollection',
    features: (mapFeatures?.features || []).filter((feature) => {
      try {
        const geom = feature?.geometry;
        if (!geom || !geom.coordinates) return false;
        return geom.type !== 'Point';
      } catch {
        return false;
      }
    }),
  }), [mapFeatures]);

  const buildingsWithPins = useMemo(
    () => buildings.filter((building) => getCoords(building)),
    [buildings, getCoords]
  );

  const officesWithPins = useMemo(
    () => offices.filter((office) => getCoords(office)),
    [offices, getCoords]
  );

  const query = searchQuery.trim().toLowerCase();
  const filteredBuildings = useMemo(() => {
    if (!query) return buildings;
    return buildings.filter((building) => building.name?.toLowerCase().includes(query));
  }, [buildings, query]);

  const filteredOffices = useMemo(() => {
    if (!query) return offices;
    return offices.filter((office) =>
      office.name?.toLowerCase().includes(query)
      || office.building?.name?.toLowerCase().includes(query)
    );
  }, [offices, query]);

  const selectedCoords = useMemo(() => ({
    lat: parseCoord(liveEdit.latitude),
    lng: parseCoord(liveEdit.longitude),
  }), [liveEdit.latitude, liveEdit.longitude]);

  const findItemByType = useCallback((type, id) => {
    if (type === 'office') return offices.find((office) => office._id === id) || null;
    return buildings.find((building) => building._id === id) || null;
  }, [buildings, offices]);

  const flyToCoords = useCallback((lat, lng) => {
    setViewState((prev) => ({ ...prev, longitude: lng, latitude: lat, zoom: 19 }));
  }, []);

  const flyToPin = useCallback((item) => {
    const coords = getCoords(item);
    if (coords) flyToCoords(coords.lat, coords.lng);
  }, [flyToCoords, getCoords]);

  const handleMapClick = useCallback((event) => {
    if (!placingPin) return;
    setTempPin({ lng: event.lngLat.lng, lat: event.lngLat.lat });
  }, [placingPin]);

  const openEditPanel = useCallback((item, type) => {
    const coords = getCoords(item);
    setSelectedPin({ ...item, pinType: type });
    setLiveEdit({
      name: item.name || '',
      description: item.description || '',
      color: getPinColor(item, type),
      latitude: formatCoord(coords?.lat),
      longitude: formatCoord(coords?.lng),
    });
    setPlacingPin(null);
    setTempPin(null);
  }, [getCoords]);

  const startPlacingPin = useCallback((item, type) => {
    const existingCoords = getCoords(item);
    setPlacingPin({ id: item._id, name: item.name, type });
    setTempPin(existingCoords);
    setSelectedPin(null);
    showNotification(`Place or drag the marker for "${item.name}", then save.`, 'info');
    if (existingCoords) {
      flyToCoords(existingCoords.lat, existingCoords.lng);
    }
  }, [flyToCoords, getCoords, showNotification]);

  const relocatePin = useCallback((item, type) => {
    const coords = getCoords(item);
    setPlacingPin({ id: item._id, name: item.name, type });
    setTempPin(coords);
    setSelectedPin(null);
    showNotification(`Drag or reposition "${item.name}" on the map, then confirm.`, 'info');
    if (coords) {
      flyToCoords(coords.lat, coords.lng);
    }
  }, [flyToCoords, getCoords, showNotification]);

  const cancelPlacing = useCallback(() => {
    setPlacingPin(null);
    setTempPin(null);
  }, []);

  const savePin = useCallback(async () => {
    if (!placingPin || !tempPin) return;
    try {
      setSaving(true);
      await mapAPI.setPin(placingPin.id, placingPin.type, {
        type: 'Point',
        coordinates: [tempPin.lng, tempPin.lat],
      });
      await Promise.all([loadData(), refreshMapFeatures()]);
      showNotification(`Pin saved for "${placingPin.name}"`);
      setPlacingPin(null);
      setTempPin(null);
    } catch (err) {
      showNotification(err.message || 'Failed to save pin', 'error');
    } finally {
      setSaving(false);
    }
  }, [loadData, placingPin, refreshMapFeatures, showNotification, tempPin]);

  const removePin = useCallback(async (item, type) => {
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
  }, [loadData, refreshMapFeatures, showNotification]);

  const saveEditedPin = useCallback(async () => {
    if (!selectedPin) return;

    const lat = parseCoord(liveEdit.latitude);
    const lng = parseCoord(liveEdit.longitude);
    if (lat === null || lng === null) {
      showNotification('Enter valid latitude and longitude before saving.', 'error');
      return;
    }

    const baseUpdate = {
      name: liveEdit.name.trim(),
      description: liveEdit.description.trim(),
      pinColor: liveEdit.color,
      markerColor: liveEdit.color,
      color: liveEdit.color,
      geometry: {
        type: 'Point',
        coordinates: [lng, lat],
      },
    };

    try {
      setSaving(true);

      if (selectedPin.pinType === 'office') {
        await officesAPI.update(selectedPin._id, {
          ...baseUpdate,
          building: selectedPin.building?._id || selectedPin.building,
          floor: selectedPin.floor,
          department: selectedPin.department,
        });
      } else {
        await buildingsAPI.update(selectedPin._id, baseUpdate);
      }

      await Promise.all([loadData(), refreshMapFeatures()]);
      showNotification(`"${liveEdit.name}" saved`);
      setSelectedPin(null);
    } catch (err) {
      showNotification(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }, [liveEdit, loadData, refreshMapFeatures, selectedPin, showNotification]);

  const handleSelectedMarkerDragEnd = useCallback((event) => {
    if (!selectedPin) return;
    setLiveEdit((prev) => ({
      ...prev,
      latitude: formatCoord(event.lngLat.lat),
      longitude: formatCoord(event.lngLat.lng),
    }));
  }, [selectedPin]);

  const handleTempPinCoordChange = useCallback((field, value) => {
    const parsed = parseCoord(value);
    if (parsed === null) return;
    setTempPin((prev) => ({
      ...(prev || { lng: viewState.longitude, lat: viewState.latitude }),
      [field]: parsed,
    }));
  }, [viewState.latitude, viewState.longitude]);

  const renderList = (items, type) => {
    const filtered = type === 'office' ? filteredOffices : filteredBuildings;
    return (
      <>
        {filtered.filter((item) => getCoords(item)).map((item) => {
          const isActive = selectedPin?._id === item._id;
          const pinColor = getPinColor(item, type);
          return (
            <div
              key={item._id}
              className={`me-list-item ${isActive ? 'me-list-item--active' : ''}`}
              onClick={() => { flyToPin(item); openEditPanel(item, type); }}
            >
              <span className="me-list-swatch" style={{ backgroundColor: pinColor }} />
              <div className="me-list-item-info">
                <span className="me-list-item-name">{item.name}</span>
                <span className="me-list-item-meta">
                  {type === 'office'
                    ? (item.building?.name || `${formatCoord(getCoords(item)?.lat, 5)}, ${formatCoord(getCoords(item)?.lng, 5)}`)
                    : `${formatCoord(getCoords(item)?.lat, 5)}, ${formatCoord(getCoords(item)?.lng, 5)}`}
                </span>
              </div>
              <div className="me-list-item-actions">
                <button className="me-icon-btn" onClick={(e) => { e.stopPropagation(); relocatePin(item, type); }} title="Move pin">↔</button>
                <button className="me-icon-btn me-icon-btn--danger" onClick={(e) => { e.stopPropagation(); removePin(item, type); }} title="Remove pin">✕</button>
              </div>
            </div>
          );
        })}

        {filtered.filter((item) => !getCoords(item)).length > 0 && (
          <div className="me-list-divider">Without Pins</div>
        )}

        {filtered.filter((item) => !getCoords(item)).map((item) => (
          <div key={item._id} className="me-list-item me-list-item--unpinned">
            <span className="me-list-swatch me-list-swatch--empty" />
            <div className="me-list-item-info">
              <span className="me-list-item-name">{item.name}</span>
            </div>
            <button className="me-btn me-btn--small" onClick={() => startPlacingPin(item, type)}>
              + Pin
            </button>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="me-list-empty">No {type === 'office' ? 'offices' : 'buildings'} found</div>
        )}
      </>
    );
  };

  return (
    <div className="me-container">
      {notification && (
        <div className={`me-toast me-toast--${notification.type}`}>
          {notification.message}
        </div>
      )}

      {placingPin && (
        <div className="me-placement-bar">
          <span>
            {tempPin
              ? <>Marker preview at <strong>{formatCoord(tempPin.lat)}, {formatCoord(tempPin.lng)}</strong> - drag or fine-tune before saving</>
              : <>Click on the map to place <strong>{placingPin.name}</strong></>
            }
          </span>
          {tempPin && (
            <div className="me-coord-inline">
              <label className="me-coord-inline-field">
                <span>Lat</span>
                <input
                  type="number"
                  step="0.000001"
                  value={tempPin.lat}
                  onChange={(e) => handleTempPinCoordChange('lat', e.target.value)}
                />
              </label>
              <label className="me-coord-inline-field">
                <span>Lng</span>
                <input
                  type="number"
                  step="0.000001"
                  value={tempPin.lng}
                  onChange={(e) => handleTempPinCoordChange('lng', e.target.value)}
                />
              </label>
            </div>
          )}
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
        <aside className="me-sidebar">
          <div className="me-sidebar-header">
            <div className="me-sidebar-heading">
              <span className="me-sidebar-kicker">ALAGAD Marker Studio</span>
              <h3 className="me-sidebar-title">Map Markers</h3>
            </div>
            <span className="me-pin-count">{buildingsWithPins.length + officesWithPins.length} pinned</span>
          </div>

          <div className="me-sidebar-summary">
            <div className="me-summary-card">
              <span className="me-summary-label">Buildings</span>
              <strong className="me-summary-value">{buildings.length}</strong>
            </div>
            <div className="me-summary-card">
              <span className="me-summary-label">Offices</span>
              <strong className="me-summary-value">{offices.length}</strong>
            </div>
          </div>

          <div className="me-search">
            <input
              type="text"
              placeholder="Search locations..."
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
            {activeTab === 'buildings' ? renderList(buildings, 'building') : renderList(offices, 'office')}
          </div>
        </aside>

        <div className="me-map-area">
          <Map
            ref={mapRef}
            {...viewState}
            onMove={(event) => setViewState(event.viewState)}
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
            {mapStyleLoaded && grassGeoJSON?.features?.length > 0 && (
              <SafeGeoJSON data={grassGeoJSON} idPrefix="grass-geojson" showPoints={false} />
            )}
            {mapStyleLoaded && <MapTrees idPrefix="grass-map-trees" />}

            {mapStyleLoaded && validFeatures.features.length > 0 && (
              <SafeGeoJSON data={validFeatures} idPrefix="map-features-geojson" />
            )}

            {mapStyleLoaded && buildingsWithPins.map((building) => {
              const coords = getCoords(building);
              if (!coords) return null;
              const isSelected = selectedPin?._id === building._id && selectedPin?.pinType === 'building';
              const latitude = isSelected && Number.isFinite(selectedCoords.lat) ? selectedCoords.lat : coords.lat;
              const longitude = isSelected && Number.isFinite(selectedCoords.lng) ? selectedCoords.lng : coords.lng;
              return (
                <Marker
                  key={`building-${building._id}`}
                  longitude={longitude}
                  latitude={latitude}
                  anchor="bottom"
                  rotation={0}
                  rotationAlignment="viewport"
                  pitchAlignment="viewport"
                  draggable={isSelected}
                  onDragEnd={handleSelectedMarkerDragEnd}
                  onClick={(event) => {
                    event.originalEvent.stopPropagation();
                    flyToPin(building);
                    openEditPanel(building, 'building');
                  }}
                >
                  <BuildingPinMarker
                    label={isSelected ? liveEdit.name || building.name : building.name}
                    color={isSelected ? liveEdit.color : getPinColor(building, 'building')}
                    highlighted={isSelected}
                  />
                </Marker>
              );
            })}

            {mapStyleLoaded && officesWithPins.map((office) => {
              const coords = getCoords(office);
              if (!coords) return null;
              const isSelected = selectedPin?._id === office._id && selectedPin?.pinType === 'office';
              const latitude = isSelected && Number.isFinite(selectedCoords.lat) ? selectedCoords.lat : coords.lat;
              const longitude = isSelected && Number.isFinite(selectedCoords.lng) ? selectedCoords.lng : coords.lng;
              return (
                <Marker
                  key={`office-${office._id}`}
                  longitude={longitude}
                  latitude={latitude}
                  anchor="bottom"
                  rotation={0}
                  rotationAlignment="viewport"
                  pitchAlignment="viewport"
                  draggable={isSelected}
                  onDragEnd={handleSelectedMarkerDragEnd}
                  onClick={(event) => {
                    event.originalEvent.stopPropagation();
                    flyToPin(office);
                    openEditPanel(office, 'office');
                  }}
                >
                  <BuildingPinMarker
                    label={isSelected ? liveEdit.name || office.name : office.name}
                    color={isSelected ? liveEdit.color : getPinColor(office, 'office')}
                    highlighted={isSelected}
                  />
                </Marker>
              );
            })}

            {mapStyleLoaded && tempPin && (
              <Marker
                longitude={tempPin.lng}
                latitude={tempPin.lat}
                anchor="bottom"
                rotation={0}
                rotationAlignment="viewport"
                pitchAlignment="viewport"
                draggable
                onDragEnd={(event) => setTempPin({ lng: event.lngLat.lng, lat: event.lngLat.lat })}
              >
                <BuildingPinMarker
                  label={placingPin?.name || 'New Location'}
                  color={getPinColor(findItemByType(placingPin?.type, placingPin?.id), placingPin?.type)}
                  highlighted
                />
              </Marker>
            )}
          </Map>

          {selectedPin && (
            <div className="me-prop-card">
              <div className="me-prop-card-header">
                <div className="me-prop-card-heading">
                  <span className="me-prop-card-kicker">{selectedPin.pinType === 'office' ? 'Office Pin' : 'Building Pin'}</span>
                  <h4 className="me-prop-card-title">{selectedPin.name}</h4>
                </div>
                <button className="me-prop-card-close" onClick={() => setSelectedPin(null)}>✕</button>
              </div>

              <div className="me-prop-card-body">
                <div className="me-prop-field">
                  <label className="me-form-label" htmlFor="me-name">Name</label>
                  <input
                    id="me-name"
                    className="me-text-input"
                    type="text"
                    value={liveEdit.name}
                    onChange={(e) => setLiveEdit((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="me-prop-field">
                  <label className="me-form-label" htmlFor="me-description">Description</label>
                  <textarea
                    id="me-description"
                    className="me-textarea"
                    rows="3"
                    value={liveEdit.description}
                    onChange={(e) => setLiveEdit((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div className="me-prop-field">
                  <span className="me-prop-field-label">Pin Color</span>
                  <div className="me-prop-color-controls">
                    <div className="me-color-grid">
                      {PIN_PALETTE.map(({ color, name }) => (
                        <button
                          key={color}
                          className={`me-color-option ${liveEdit.color === color ? 'me-color-option--active' : ''}`}
                          onClick={() => setLiveEdit((prev) => ({ ...prev, color }))}
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
                          onChange={(e) => setLiveEdit((prev) => ({ ...prev, color: e.target.value.toUpperCase() }))}
                          className="me-color-input"
                        />
                      </label>
                      <span className="me-color-hex">{liveEdit.color.toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                <div className="me-prop-field">
                  <div className="me-prop-field-label">
                    Coordinates
                    <span className="me-prop-field-value">Drag the pin or type values</span>
                  </div>
                  <div className="me-coord-grid">
                    <label className="me-coord-field">
                      <span>Latitude</span>
                      <input
                        type="number"
                        step="0.000001"
                        value={liveEdit.latitude}
                        onChange={(e) => setLiveEdit((prev) => ({ ...prev, latitude: e.target.value }))}
                      />
                    </label>
                    <label className="me-coord-field">
                      <span>Longitude</span>
                      <input
                        type="number"
                        step="0.000001"
                        value={liveEdit.longitude}
                        onChange={(e) => setLiveEdit((prev) => ({ ...prev, longitude: e.target.value }))}
                      />
                    </label>
                  </div>
                </div>

                <div className="me-prop-preview">
                  <span className="me-prop-preview-label">Live Preview</span>
                  <BuildingPinMarker label={liveEdit.name || selectedPin.name} color={liveEdit.color} highlighted />
                </div>
              </div>

              <div className="me-prop-card-footer">
                <button
                  className="me-btn me-btn--ghost me-btn--danger-text"
                  onClick={() => removePin(selectedPin, selectedPin.pinType)}
                >
                  Remove
                </button>
                <div className="me-prop-card-footer-right">
                  <button className="me-btn me-btn--ghost" onClick={() => relocatePin(selectedPin, selectedPin.pinType)}>Move</button>
                  <button className="me-btn me-btn--ghost" onClick={() => setSelectedPin(null)}>Cancel</button>
                  <button className="me-btn me-btn--primary" onClick={saveEditedPin} disabled={saving}>
                    {saving ? 'Saving...' : 'Done'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {saving && (
            <div className="me-saving-indicator">
              <div className="me-saving-spinner" />
              Saving...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MapEditor;
