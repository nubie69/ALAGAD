import React, { createContext, useState, useContext, useEffect } from 'react';
import { mapAPI } from '../utils/api';

// Bukidnon State University, Malaybalay Campus - Fortich St, Malaybalay City, Bukidnon
const BUKSU_CAMPUS_CENTER = { lat: 8.1564, lng: 125.1247 };

const MapContext = createContext(null);

export const MapProvider = ({ children }) => {
  const [mapCenter, setMapCenter] = useState(BUKSU_CAMPUS_CENTER);
  const [mapZoom, setMapZoom] = useState(17);
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [mapFeatures, setMapFeatures] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch map features from backend on mount
  useEffect(() => {
    fetchMapFeatures();
  }, []);

  // Request browser geolocation and watch for live updates
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isMobileBrowser = typeof navigator !== 'undefined'
      && /android|iphone|ipad|ipod/i.test(navigator.userAgent || '');
    const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : false;

    // Mobile geolocation generally requires HTTPS (except localhost secure-context exemption).
    if (isMobileBrowser && !isSecureContext && !isLocalhost) {
      setLocationError('GPS requires HTTPS on mobile browsers. Open the app via an HTTPS URL (for example, ngrok).');
      return;
    }

    let watchId = null;
    let retryTimer = null;
    let highRetryCount = 0;
    const MAX_HIGH_RETRIES = 3;

    const getWatchOptions = (mode) => {
      if (mode === 'high') {
        return {
          enableHighAccuracy: true,
          maximumAge: 1500,
          timeout: 15000,
        };
      }

      return {
        enableHighAccuracy: false,
        maximumAge: 60000,
        timeout: 12000,
      };
    };

    const normalizeLocation = (pos, mode) => ({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
      heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
      speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
      timestamp: Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now(),
      source: mode === 'high' ? 'gps_high_accuracy' : 'network_fallback',
    });

    const startWatch = (mode = 'high') => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation(normalizeLocation(pos, mode));
          setLocationError(null);
          highRetryCount = 0;

          // After a coarse fallback fix, periodically retry high-accuracy GPS.
          if (mode !== 'high') {
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => startWatch('high'), 20000);
          }
        },
        (err) => {
          if (err.code === 1) {
            // Permission denied: user can still allow later from browser prompt/settings.
            setLocationError('Location permission denied. Allow location access to enable navigation.');
            return;
          }

          if (mode === 'high' && (err.code === 2 || err.code === 3)) {
            if (highRetryCount < MAX_HIGH_RETRIES) {
              highRetryCount += 1;
              if (retryTimer) clearTimeout(retryTimer);
              retryTimer = setTimeout(() => startWatch('high'), 2500);
              return;
            }

            setLocationError('High-accuracy GPS is weak; using Wi-Fi/cell fallback.');
            startWatch('coarse');
            return;
          }

          if (mode === 'coarse' && (err.code === 2 || err.code === 3)) {
            setLocationError('Location signal is weak indoors. Move to an open area or near a window.');
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => startWatch('high'), 12000);
          }
        },
        getWatchOptions(mode)
      );
    };

    // Always request high-accuracy location first (navigation mode).
    startWatch('high');

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  const fetchMapFeatures = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching map features from API...');
      const features = await mapAPI.getFeatures();
      console.log('Map features received:', features);
      setMapFeatures(features);
    } catch (err) {
      console.error('Error fetching map features:', err);
      setError(err.message);
      // Set empty feature collection on error
      setMapFeatures({ type: 'FeatureCollection', features: [] });
    } finally {
      setLoading(false);
    }
  };

  const addMapFeature = async (newFeature) => {
    try {
      // If feature has an ID, it's an update; otherwise, create new
      if (newFeature.properties.id) {
        await mapAPI.saveFeature({
          type: newFeature.properties.type,
          properties: newFeature.properties,
          geometry: newFeature.geometry,
        });
      } else {
        await mapAPI.createFeature({
          type: newFeature.properties.type,
          properties: newFeature.properties,
          geometry: newFeature.geometry,
        });
      }
      // Refresh features from backend
      await fetchMapFeatures();
    } catch (err) {
      console.error('Error saving map feature:', err);
      throw err;
    }
  };

  const updateMapFeature = async (updatedFeature) => {
    try {
      await mapAPI.saveFeature({
        type: updatedFeature.properties.type,
        properties: updatedFeature.properties,
        geometry: updatedFeature.geometry,
      });
      // Refresh features from backend
      await fetchMapFeatures();
    } catch (err) {
      console.error('Error updating map feature:', err);
      throw err;
    }
  };

  const deleteMapFeature = async (featureId, featureType) => {
    try {
      await mapAPI.deleteFeature(featureId, featureType);
      // Refresh features from backend
      await fetchMapFeatures();
    } catch (err) {
      console.error('Error deleting map feature:', err);
      throw err;
    }
  };

  return (
    <MapContext.Provider 
      value={{
        mapCenter,
        setMapCenter,
        mapZoom,
        setMapZoom,
        mapFeatures,
        loading,
        error,
        userLocation,
        locationError,
        addMapFeature,
        updateMapFeature,
        deleteMapFeature,
        refreshMapFeatures: fetchMapFeatures,
        campusCenter: BUKSU_CAMPUS_CENTER,
      }}
    >
      {children}
    </MapContext.Provider>
  );
};

export const useMapState = () => {
  return useContext(MapContext);
};
