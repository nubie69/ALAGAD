import React, { useCallback, useState, useEffect, useRef } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapState } from '../context/MapContext';
import { useAuth } from '../context/AuthContext';
import { buildingsAPI, roomsAPI, officesAPI } from '../utils/api';
import SafeGeoJSON from './SafeGeoJSON';
import '../styles/SuperAdminMapEditor.css';

const BUKSU_CAMPUS = {
  center: { lat: 8.1574, lng: 125.1248 },
  zoom: 17,
  bounds: {
    north: 8.162,
    south: 8.150,
    east: 125.132,
    west: 125.116,
  },
};

// Campus boundaries - prevents scrolling outside this area
const CAMPUS_BOUNDS = [[125.1210, 8.1535], [125.1270, 8.1595]];

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

function SuperAdminMapEditor() {
  const { mapFeatures, addMapFeature, refreshMapFeatures } = useMapState();
  const { user } = useAuth();
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  
  // Data states
  const [buildings, setBuildings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [offices, setOffices] = useState([]);
  
  // UI states
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('buildings'); // 'buildings', 'locations', 'routes', 'layers'
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [editingFeature, setEditingFeature] = useState(null);
  const [newFeature, setNewFeature] = useState(null);
  const [autoSave, setAutoSave] = useState(true);
  const [editingMode, setEditingMode] = useState(true);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  
  // Map view state
  const [viewState, setViewState] = useState({
    longitude: BUKSU_CAMPUS.center.lng,
    latitude: BUKSU_CAMPUS.center.lat,
    zoom: BUKSU_CAMPUS.zoom,
    bearing: 0,
    pitch: 0,
  });
  
  // Form data
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    buildingId: '',
    type: 'building', // 'building', 'office', 'room'
    markerColor: '#3b82f6',
  });

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [buildingsData, roomsData, officesData] = await Promise.all([
          buildingsAPI.getAll().catch(() => []),
          roomsAPI.getAll().catch(() => []),
          officesAPI.getAll().catch(() => []),
        ]);
        setBuildings(buildingsData);
        setRooms(roomsData);
        setOffices(officesData);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    loadData();
  }, []);

  const handleDrawEnd = useCallback(() => {
    if (!drawRef.current) return;
    
    const data = drawRef.current.getAll();
    if (!data.features || data.features.length === 0) return;
    
    const feature = data.features[data.features.length - 1];
    const geometry = feature.geometry;
    
    // Determine feature type based on geometry
    const featureType = geometry.type === 'Polygon' ? 'polygon' : 'marker';
    
    setNewFeature({
      id: feature.id,
      featureType,
      geometry,
    });

    setFormData({
      name: '',
      description: '',
      location: '',
      buildingId: buildings.length > 0 ? buildings[0]._id : '',
      type: featureType === 'polygon' ? 'building' : 'office',
      markerColor: '#3b82f6',
    });

    setShowModal(true);
  }, [buildings]);

  // Initialize map
  const onMapLoad = useCallback(() => {
    if (!mapRef.current) return;
    
    const map = mapRef.current.getMap();
    
    // Wait for style to load before initializing draw controls
    const initializeDraw = () => {
      // Add a small delay to ensure style is completely ready
      setTimeout(() => {
        setMapStyleLoaded(true);
        
        // Initialize MapboxDraw
        drawRef.current = new MapboxDraw({
          displayControlsDefault: false,
          controls: {
            polygon: true,
            point: true,
            trash: true,
          },
        });
        
        map.addControl(drawRef.current, 'top-right');
        
        // Listen for draw events
        map.on('draw.create', handleDrawEnd);
        map.on('draw.update', handleDrawEnd);
        map.on('draw.delete', handleDrawEnd);
      }, 100);
    };
    
    // Check if style is already loaded
    if (map.isStyleLoaded()) {
      initializeDraw();
    } else {
      // Wait for style to load
      map.on('style.load', initializeDraw);
    }
  }, [handleDrawEnd]);

  // Validate geometry
  const isValidGeometry = (geometry) => {
    if (!geometry || !geometry.coordinates) return false;
    if (geometry.type === 'Point') {
      return geometry.coordinates.length === 2 &&
        geometry.coordinates[0] !== undefined &&
        geometry.coordinates[1] !== undefined;
    }
    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
      return geometry.coordinates && geometry.coordinates.length > 0;
    }
    if (geometry.type === 'LineString') {
      return geometry.coordinates && geometry.coordinates.length >= 2;
    }
    return false;
  };

  const validFeatures = {
    type: 'FeatureCollection',
    features: (mapFeatures?.features || []).filter((feature) => {
      try {
        return isValidGeometry(feature.geometry);
      } catch (err) {
        console.warn('Invalid feature geometry:', feature, err);
        return false;
      }
    }),
  };

  // Marker color swatches
  const MARKER_COLORS = [
    { value: '#3b82f6', label: 'Blue' },
    { value: '#ef4444', label: 'Red' },
    { value: '#10b981', label: 'Green' },
    { value: '#f59e0b', label: 'Amber' },
    { value: '#8b5cf6', label: 'Purple' },
    { value: '#ec4899', label: 'Pink' },
    { value: '#06b6d4', label: 'Cyan' },
    { value: '#f97316', label: 'Orange' },
  ];

  // Save feature
  const handleSaveFeature = async () => {
    const { name, description, location, buildingId, type, markerColor } = formData;

    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    if (type !== 'building' && !buildingId) {
      alert('Please select a building');
      return;
    }

    try {
      setSaving(true);

      const feature = {
        type: 'Feature',
        properties: {
          type: type,
          name: name.trim(),
          description: description.trim(),
          ...(type === 'building' && { location: location.trim() || name.trim() }),
          ...(type !== 'building' && { buildingId }),
          ...(newFeature.featureType === 'marker' && { markerColor }),
        },
        geometry: newFeature.geometry,
      };

      await addMapFeature(feature);
      await refreshMapFeatures();
      
      // Remove the drawn feature from the draw tool
      if (drawRef.current && newFeature.id) {
        drawRef.current.delete(newFeature.id);
      }
      
      setShowModal(false);
      setNewFeature(null);
      setFormData({ name: '', description: '', location: '', buildingId: '', type: 'building' });
    } catch (error) {
      console.error('Error saving feature:', error);
      alert('Error saving feature: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete feature
  const handleDeleteFeature = async (featureIndex) => {
    if (!window.confirm('Are you sure you want to delete this feature?')) {
      return;
    }

    try {
      setSaving(true);
      const updatedFeatures = {
        ...mapFeatures,
        features: mapFeatures.features.filter((_, idx) => idx !== featureIndex),
      };

      await addMapFeature(updatedFeatures);
      await refreshMapFeatures();
      setSelectedFeature(null);
    } catch (error) {
      console.error('Error deleting feature:', error);
      alert('Error deleting feature: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Close modal
  const handleCancel = () => {
    setShowModal(false);
    if (drawRef.current && newFeature?.id) {
      drawRef.current.delete(newFeature.id);
    }
    setNewFeature(null);
    setFormData({ name: '', description: '', location: '', buildingId: '', type: 'building' });
  };

  return (
    <div className="map-editor-container">
      {/* Top Toolbar */}
      <div className="map-editor-toolbar">
        <div className="toolbar-left">
          <h1 className="toolbar-title">Map Editor</h1>
        </div>
        
        <div className="toolbar-center">
          <button 
            className="toolbar-btn toolbar-btn--primary"
            title="Add a new building (draw polygon)"
          >
            + Add Building
          </button>
          <button 
            className="toolbar-btn toolbar-btn--secondary"
            title="Add a marker or location"
          >
            📍 Add Marker
          </button>
          <button 
            className="toolbar-btn toolbar-btn--secondary"
            title="Draw a route or pathway"
          >
            ↗ Add Route
          </button>
        </div>
        
        <div className="toolbar-right">
          <button 
            className="toolbar-btn toolbar-btn--success"
            disabled={saving}
            title="Save all changes"
          >
            {saving ? '💾 Saving...' : '💾 Save'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="map-editor-content">
        {/* Left Editing Panel */}
        <aside className="map-editor-sidebar">
          {/* Panel Tabs */}
          <div className="sidebar-tabs">
            <button
              className={`tab-btn ${activeTab === 'buildings' ? 'active' : ''}`}
              onClick={() => setActiveTab('buildings')}
              title="Manage buildings"
            >
              🏢 Buildings
            </button>
            <button
              className={`tab-btn ${activeTab === 'locations' ? 'active' : ''}`}
              onClick={() => setActiveTab('locations')}
              title="Manage locations and markers"
            >
              📍 Locations
            </button>
            <button
              className={`tab-btn ${activeTab === 'routes' ? 'active' : ''}`}
              onClick={() => setActiveTab('routes')}
              title="Manage routes and paths"
            >
              ↗ Routes
            </button>
            <button
              className={`tab-btn ${activeTab === 'layers' ? 'active' : ''}`}
              onClick={() => setActiveTab('layers')}
              title="Manage map layers"
            >
              ⚙ Layers
            </button>
          </div>

          {/* Panel Content */}
          <div className="sidebar-content">
            {/* Buildings Tab */}
            {activeTab === 'buildings' && (
              <div className="panel-section">
                <div className="panel-header">
                  <h3>Buildings ({buildings.length})</h3>
                </div>
                <div className="panel-list">
                  {buildings.length > 0 ? (
                    buildings.map((building) => (
                      <div key={building._id} className="list-item">
                        <div className="list-item-icon">🏢</div>
                        <div className="list-item-content">
                          <div className="list-item-title">{building.name}</div>
                          <div className="list-item-meta">{building.location}</div>
                        </div>
                        <button className="list-item-btn" title="Edit">✎</button>
                      </div>
                    ))
                  ) : (
                    <div className="panel-empty">No buildings yet. Draw one on the map.</div>
                  )}
                </div>
              </div>
            )}

            {/* Locations Tab */}
            {activeTab === 'locations' && (
              <div className="panel-section">
                <div className="panel-header">
                  <h3>Locations & Offices ({offices.length + rooms.length})</h3>
                </div>
                <div className="panel-list">
                  {offices.length > 0 || rooms.length > 0 ? (
                    <>
                      {offices.map((office) => (
                        <div key={office._id} className="list-item">
                          <div className="list-item-icon">🚪</div>
                          <div className="list-item-content">
                            <div className="list-item-title">{office.name}</div>
                            <div className="list-item-meta">{office.building?.name}</div>
                          </div>
                          <button className="list-item-btn" title="Edit">✎</button>
                        </div>
                      ))}
                      {rooms.map((room) => (
                        <div key={room._id} className="list-item">
                          <div className="list-item-icon">🚪</div>
                          <div className="list-item-content">
                            <div className="list-item-title">{room.name}</div>
                            <div className="list-item-meta">{room.building?.name}</div>
                          </div>
                          <button className="list-item-btn" title="Edit">✎</button>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="panel-empty">No locations yet. Add markers on the map.</div>
                  )}
                </div>
              </div>
            )}

            {/* Routes Tab */}
            {activeTab === 'routes' && (
              <div className="panel-section">
                <div className="panel-header">
                  <h3>Routes & Pathways (0)</h3>
                </div>
                <div className="panel-empty" style={{ padding: '24px 16px' }}>
                  Routes help visitors navigate between buildings. Draw lines on the map to create routes.
                </div>
              </div>
            )}

            {/* Layers Tab */}
            {activeTab === 'layers' && (
              <div className="panel-section">
                <div className="panel-header">
                  <h3>Map Layers</h3>
                </div>
                <div className="panel-content-inner">
                  <div className="layer-toggle">
                    <div className="toggle-label">
                      <input type="checkbox" id="buildings-layer" defaultChecked />
                      <label htmlFor="buildings-layer">Buildings</label>
                    </div>
                    <span className="toggle-count">{buildings.length}</span>
                  </div>
                  <div className="layer-toggle">
                    <div className="toggle-label">
                      <input type="checkbox" id="locations-layer" defaultChecked />
                      <label htmlFor="locations-layer">Locations/Offices</label>
                    </div>
                    <span className="toggle-count">{offices.length + rooms.length}</span>
                  </div>
                  <div className="layer-toggle">
                    <div className="toggle-label">
                      <input type="checkbox" id="routes-layer" defaultChecked />
                      <label htmlFor="routes-layer">Routes/Pathways</label>
                    </div>
                    <span className="toggle-count">0</span>
                  </div>
                  <div className="layer-toggle">
                    <div className="toggle-label">
                      <input type="checkbox" id="grid-layer" />
                      <label htmlFor="grid-layer">Grid/Labels</label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Map Area */}
        <div className="map-editor-area">
          <Map
            ref={mapRef}
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            mapboxAccessToken={MAPBOX_TOKEN}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/zach-2002/cmmfqzvkr000w01sp0vw694hy"
            maxBounds={CAMPUS_BOUNDS}
            onLoad={onMapLoad}
            minZoom={16}
            maxZoom={20}
          >
            {/* GeoJSON layer for map features */}
            {mapStyleLoaded && <SafeGeoJSON data={validFeatures} />}
          </Map>

          {/* Saving Indicator */}
          {saving && (
            <div className="map-indicator map-indicator--saving">
              <span className="saving-spinner"></span>
              Saving changes...
            </div>
          )}

          {/* Status Indicator */}
          <div className="map-status-indicator">
            <div className="status-content">
              <div className="status-dot status-dot--active"></div>
              <div className="status-text">
                <div className="status-main">
                  {editingMode ? 'Editing Mode Active' : 'View Mode'}
                </div>
                <div className="status-sub">
                  {autoSave ? '✓ Auto Save Enabled' : '⏸ Auto Save Disabled'}
                </div>
              </div>
            </div>
            <button 
              className="status-toggle"
              onClick={() => setAutoSave(!autoSave)}
              title={autoSave ? 'Disable auto save' : 'Enable auto save'}
            >
              {autoSave ? '○' : '◐'}
            </button>
          </div>
        </div>
      </div>

      {/* Feature Edit Modal */}
      {showModal && newFeature && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h2>
                {formData.type === 'building' ? 'Add Building' : 
                 formData.type === 'office' ? 'Add Office' : 'Add Location'}
              </h2>
              <button 
                className="modal-close"
                onClick={handleCancel}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={
                    formData.type === 'building' 
                      ? 'Enter building name' 
                      : 'Enter location name'
                  }
                  className="form-input"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Add optional description..."
                  className="form-textarea"
                />
              </div>

              {formData.type === 'building' && (
                <div className="form-group">
                  <label className="form-label">Location/Address</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Building location or address"
                    className="form-input"
                  />
                </div>
              )}

              {formData.type !== 'building' && (
                <div className="form-group">
                  <label className="form-label">Building *</label>
                  <select
                    value={formData.buildingId}
                    onChange={(e) => setFormData({ ...formData, buildingId: e.target.value })}
                    className="form-select"
                  >
                    <option value="">Select a building...</option>
                    {buildings.map((building) => (
                      <option key={building._id} value={building._id}>
                        {building.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newFeature && newFeature.featureType === 'marker' && (
                <div className="form-group">
                  <label className="form-label">Pin Color</label>
                  <div className="color-swatches">
                    {MARKER_COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        className={`color-swatch${formData.markerColor === color.value ? ' color-swatch--selected' : ''}`}
                        style={{ backgroundColor: color.value }}
                        title={color.label}
                        onClick={() => setFormData({ ...formData, markerColor: color.value })}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                onClick={handleCancel}
                className="btn btn--secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFeature}
                disabled={saving}
                className="btn btn--primary"
              >
                {saving ? 'Saving...' : 'Save Feature'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperAdminMapEditor;
