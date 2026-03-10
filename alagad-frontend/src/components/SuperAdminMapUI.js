import React, { useState, useEffect } from 'react';
import { DrawingManager } from '@react-google-maps/api';
import { useMapState } from '../context/MapContext';
import { buildingsAPI } from '../utils/api';

function SuperAdminMapUI({ mapRef }) {
  const { addMapFeature, refreshMapFeatures } = useMapState();
  const [saving, setSaving] = useState(false);
  const [buildings, setBuildings] = useState([]);

  useEffect(() => {
    buildingsAPI.getAll().then(setBuildings).catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    // Enable rotation on Google Maps - rotations are available via gesture handling
    // Users can rotate with Ctrl+drag (desktop) or two-finger rotation (mobile)
    if (mapRef) {
      // Gesture handling is enabled by default in Google Maps v3
      // Rotation controls are shown on devices that support gestures
    }
  }, [mapRef]);

  const overlayToGeoJSON = (overlay, type) => {
    if (type === 'marker') {
      const pos = overlay.getPosition();
      return {
        type: 'Feature',
        properties: { type: 'office' },
        geometry: {
          type: 'Point',
          coordinates: [pos.lng(), pos.lat()],
        },
      };
    }
    if (type === 'polygon') {
      const path = overlay.getPath();
      const coords = [];
      for (let i = 0; i < path.getLength(); i++) {
        const p = path.getAt(i);
        coords.push([p.lng(), p.lat()]);
      }
      if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push(coords[0]);
      }
      return {
        type: 'Feature',
        properties: { type: 'building' },
        geometry: {
          type: 'Polygon',
          coordinates: [coords],
        },
      };
    }
    return null;
  };

  const handleOverlayComplete = async (e) => {
    const overlay = e.overlay;
    const type = e.type === 'marker' ? 'marker' : e.type === 'polygon' ? 'polygon' : null;
    if (!type) return;

    const feature = overlayToGeoJSON(overlay, type);
    if (!feature) return;

    try {
      setSaving(true);
      const name = prompt(`Enter a name for this ${type}:`, `${type === 'building' ? 'Building' : 'Office'} ${new Date().toLocaleTimeString()}`);
      if (!name) {
        overlay.setMap(null);
        return;
      }
      feature.properties.name = name;
      feature.properties.description = prompt('Enter a description (optional):', '') || '';
      feature.properties.location = type === 'building' ? name : '';

      if (type === 'office') {
        if (buildings.length === 0) {
          alert('Create a building first (draw a polygon on the map), then add offices.');
          overlay.setMap(null);
          return;
        }
        const buildingId = prompt(
          `Enter Building ID for this office, or pick from:\n${buildings.slice(0, 5).map((b) => `${b._id}: ${b.name}`).join('\n')}\n...`,
          buildings[0]?._id || ''
        );
        if (!buildingId) {
          overlay.setMap(null);
          return;
        }
        feature.properties.buildingId = buildingId;
      }

      await addMapFeature(feature);
      overlay.setMap(null);
      await refreshMapFeatures();
    } catch (err) {
      console.error('Error saving feature:', err);
      alert('Failed to save: ' + err.message);
      overlay.setMap(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {saving && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'white',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 1000,
          }}
        >
          Saving...
        </div>
      )}
      <DrawingManager
        options={{
          drawingControl: true,
          drawingControlOptions: {
            position: 2, // TOP_RIGHT
            drawingModes: ['polygon', 'marker'],
          },
        }}
        onOverlayComplete={handleOverlayComplete}
      />
    </>
  );
}

export default SuperAdminMapUI;
