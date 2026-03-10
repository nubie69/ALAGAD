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

    let watchId = null;
    let retryTimer = null;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    const startWatch = (highAccuracy) => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationError(null);
          retryCount = 0;
          // Once we have a low-accuracy fix, upgrade to high accuracy
          if (!highAccuracy) {
            startWatch(true);
          }
        },
        (err) => {
          // On timeout or position unavailable, retry silently
          if ((err.code === 2 || err.code === 3) && retryCount < MAX_RETRIES) {
            retryCount++;
            retryTimer = setTimeout(() => startWatch(false), 3000);
          } else if (err.code === 1) {
            // Permission denied — don't retry, but don't set hard error
            // User may grant later when startNavigation asks
            setLocationError('Location permission not granted yet');
          }
        },
        {
          enableHighAccuracy: highAccuracy,
          maximumAge: highAccuracy ? 10000 : 60000,
          timeout: highAccuracy ? 20000 : 10000,
        }
      );
    };

    // Start with low accuracy for a quick initial fix
    startWatch(false);

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
