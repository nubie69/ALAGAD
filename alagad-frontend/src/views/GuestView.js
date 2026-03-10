import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import Map, { Source, Layer, Marker, Popup } from 'react-map-gl';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import SafeGeoJSON from '../components/SafeGeoJSON';
import BuildingMarkers from '../components/BuildingMarkers';
import { BoxMarker } from '../components/BoxMarker';
import ChatBot from '../components/ChatBot';
import CampusBoundaryFocus from '../components/CampusBoundaryFocus';
import { useMapState } from '../context/MapContext';
import { useAuth } from '../context/AuthContext';
import { buildingsAPI, roomsAPI, officesAPI, facultyAPI, settingsAPI } from '../utils/api';

import '../App.css';
import './GuestView.modern.css';
import { BackIcon, MapPinIconOutline } from '../utils/icons';
import { findCampusRoute, isInsideCampus, nearestPointOnCampus, getWalkablePathsGeoJSON } from '../utils/campusPathfinding';
import streetNamesGeoJSON from '../data/streetNames.json';

// Bukidnon State University campus bounds (Malaybalay, Bukidnon)
const BUKSU_CAMPUS = {
  center: { lat: 8.156827, lng: 125.124307 },
  zoom: 17.60,
  pitch: 36.39,
  bearing: -138.06,
  bounds: {
    north: 8.162,
    south: 8.150,
    east: 125.132,
    west: 125.116,
  },
};

// Campus boundaries - prevents scrolling outside this area
const CAMPUS_BOUNDS = [[125.1210, 8.1535], [125.1270, 8.1595]];

const FOCUS_POLYGON = [[
  [125.12456418217545, 8.154505505739735],
  [125.12503575940372, 8.155094347366543],
  [125.12487136289235, 8.155618125590507],
  [125.12532179656523, 8.156040924725630],
  [125.12486434691505, 8.156518083693186],
  [125.12539204391481, 8.157124181943814],
  [125.12431697589870, 8.158077208941322],
  [125.12328810522973, 8.156866866747990],
  [125.12275104559546, 8.156237148346690],
  [125.12250399779055, 8.155847893814325],
  [125.12318252810218, 8.155403919123685],
  [125.12389419523038, 8.155031622086554],
  [125.12456418217545, 8.154505505739735],
]];

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

function GuestView() {
  const { mapFeatures, loading: mapLoading, userLocation, locationError } = useMapState();
  console.log('Map Features:', mapFeatures);
  console.log('Map Loading:', mapLoading);
  console.log('User Location:', userLocation);
  
  // eslint-disable-next-line no-unused-vars
  const { user } = useAuth();
  const mapRef = useRef(null);
  const wrapperRef = useRef(null);
  const detailsContentRef = useRef(null);

  const [heading, setHeading] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth > 768);
  const [sidebarQuery, setSidebarQuery] = useState('');
  const sidebarInputRef = useRef(null);
  const [systemStatus, setSystemStatus] = useState({ maintenanceMode: false, kioskStatus: 'online' });
  const [statusLoading, setStatusLoading] = useState(true);
  const [buildings, setBuildings] = useState([]);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);

  // Collapsed state for quick nav sections
  const [roomsCollapsed, setRoomsCollapsed] = useState(false);
  const [officesCollapsed, setOfficesCollapsed] = useState(false);

  // Bottom sheet state for mobile (Google Maps style)
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const [sheetSnap, setSheetSnap] = useState('peek'); // 'peek' | 'half' | 'full'
  const sheetRef = useRef(null);
  const resetBtnRef = useRef(null);
  const dragState = useRef({ startY: 0, startHeight: 0, dragging: false });

  // Snap heights as vh
  const SNAP_PEEK = 12;   // peek: just the handle + search bar peek
  const SNAP_HALF = 50;   // half: search + some results
  const SNAP_FULL = 92;   // full: nearly full screen

  const getSnapHeight = useCallback((snap) => {
    switch (snap) {
      case 'peek': return SNAP_PEEK;
      case 'half': return SNAP_HALF;
      case 'full': return SNAP_FULL;
      default: return SNAP_PEEK;
    }
  }, []);

  const snapToNearest = useCallback((currentVh) => {
    const dPeek = Math.abs(currentVh - SNAP_PEEK);
    const dHalf = Math.abs(currentVh - SNAP_HALF);
    const dFull = Math.abs(currentVh - SNAP_FULL);
    const min = Math.min(dPeek, dHalf, dFull);
    if (min === dPeek) return 'peek';
    if (min === dHalf) return 'half';
    return 'full';
  }, []);

  const handleSheetTouchStart = useCallback((e) => {
    if (!sheetRef.current) return;
    const touch = e.touches[0];
    dragState.current = {
      startY: touch.clientY,
      startHeight: sheetRef.current.getBoundingClientRect().height,
      dragging: true,
    };
    sheetRef.current.style.transition = 'none';
    if (resetBtnRef.current) resetBtnRef.current.style.transition = 'none';
  }, []);

  const handleSheetTouchMove = useCallback((e) => {
    if (!dragState.current.dragging || !sheetRef.current) return;
    const touch = e.touches[0];
    const delta = dragState.current.startY - touch.clientY;
    const newHeight = Math.max(0, Math.min(window.innerHeight * 0.95, dragState.current.startHeight + delta));
    sheetRef.current.style.height = `${newHeight}px`;
    
    const newHeightVh = (newHeight / window.innerHeight) * 100;

    // Move reset button above the bottom sheet
    if (resetBtnRef.current) {
      resetBtnRef.current.style.bottom = `${newHeight + 56}px`;
      // Fade out reset button as sheet approaches full
      const fadeStart = SNAP_HALF + 10; // start fading past half
      const fadeEnd = SNAP_FULL;         // fully transparent at full
      if (newHeightVh >= fadeEnd) {
        resetBtnRef.current.style.opacity = '0';
        resetBtnRef.current.style.pointerEvents = 'none';
      } else if (newHeightVh > fadeStart) {
        const o = 1 - ((newHeightVh - fadeStart) / (fadeEnd - fadeStart));
        resetBtnRef.current.style.opacity = `${Math.max(0, o)}`;
        resetBtnRef.current.style.pointerEvents = o > 0.1 ? 'auto' : 'none';
      } else {
        resetBtnRef.current.style.opacity = '1';
        resetBtnRef.current.style.pointerEvents = 'auto';
      }
    }

    // Calculate chatbot opacity based on sheet height
    const peekHeight = SNAP_PEEK;
    const fadeStartHeight = 30;
    
    if (newHeightVh <= peekHeight) {
      setChatbotOpacity(1);
    } else if (newHeightVh >= fadeStartHeight) {
      setChatbotOpacity(0);
    } else {
      const opacity = 1 - ((newHeightVh - peekHeight) / (fadeStartHeight - peekHeight));
      setChatbotOpacity(Math.max(0, opacity));
    }
  }, [SNAP_PEEK, SNAP_HALF, SNAP_FULL]);

  const handleSheetTouchEnd = useCallback(() => {
    if (!dragState.current.dragging || !sheetRef.current) return;
    dragState.current.dragging = false;
    const currentH = sheetRef.current.getBoundingClientRect().height;
    const currentVh = (currentH / window.innerHeight) * 100;
    const snapTransition = 'all 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
    sheetRef.current.style.transition = 'height 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
    const nearest = snapToNearest(currentVh);
    setSheetSnap(nearest);
    sheetRef.current.style.height = `${getSnapHeight(nearest)}vh`;

    // Animate reset button to snapped position
    if (resetBtnRef.current) {
      resetBtnRef.current.style.transition = snapTransition;
      const snapH = getSnapHeight(nearest);
      resetBtnRef.current.style.bottom = `calc(${snapH}vh + 56px)`;
      if (nearest === 'full') {
        resetBtnRef.current.style.opacity = '0';
        resetBtnRef.current.style.pointerEvents = 'none';
      } else {
        resetBtnRef.current.style.opacity = '1';
        resetBtnRef.current.style.pointerEvents = 'auto';
      }
    }
    
    // Reset chatbot opacity after snap
    if (nearest === 'peek') {
      setChatbotOpacity(1);
    } else {
      setChatbotOpacity(0);
    }
  }, [snapToNearest, getSnapHeight]);
  
  // Voice language for sidebar search (Cebuano, Tagalog, English)

  const [rooms, setRooms] = useState([]);
  const [offices, setOffices] = useState([]);
  const [faculty, setFaculty] = useState([]);
  
  // Chatbot opacity tracking for drag interactions
  const [chatbotOpacity, setChatbotOpacity] = useState(1);
  const [chatbotOpen, setChatbotOpen] = useState(false);
  
  // Selected location tracking
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedItemType, setSelectedItemType] = useState(null); // 'building', 'room', 'office'
  const [popupOffice, setPopupOffice] = useState(null);
  
  // Quick nav panel state (for detailed view like Google Maps)
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false);
  const [quickNavBuilding, setQuickNavBuilding] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(1);

  // Navigation state
  const [navigationRoute, setNavigationRoute] = useState(null); // GeoJSON route geometry
  const [navigationSteps, setNavigationSteps] = useState([]); // Turn-by-turn steps
  const [navigationSummary, setNavigationSummary] = useState(null); // { distance, duration }
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState(null); // target building name for marker matching
  const [navigationDisplayName, setNavigationDisplayName] = useState(null); // display name in navigation bar
  const [navigationError, setNavigationError] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [locationPromptVisible, setLocationPromptVisible] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [pendingNavTarget, setPendingNavTarget] = useState(null);
  
  // Map view state
  const [viewState, setViewState] = useState({
    longitude: BUKSU_CAMPUS.center.lng,
    latitude: BUKSU_CAMPUS.center.lat,
    zoom: BUKSU_CAMPUS.zoom,
    bearing: BUKSU_CAMPUS.bearing,
    pitch: BUKSU_CAMPUS.pitch,
  });
  
  // Recent locations tracking
  const [recentLocations, setRecentLocations] = useState(() => {
    try {
      const stored = localStorage.getItem('alagad-recent-locations');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // One label per line segment, at the segment midpoint, rotated to match the road
  const streetLabelPoints = useMemo(() => {
    const lineFeatures = streetNamesGeoJSON?.features || [];

    return lineFeatures
      .map((feature) => {
        const name = feature?.properties?.name;
        const geom = feature?.geometry;
        if (!name || !geom || geom.type !== 'LineString') return null;
        const coords = geom.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return null;

        const start = coords[0];
        const end = coords[coords.length - 1];

        // Midpoint of this segment
        const longitude = (start[0] + end[0]) / 2;
        const latitude = (start[1] + end[1]) / 2;

        // Bearing from north (CW degrees): atan2(dLng, dLat)
        const dLng = end[0] - start[0];
        const dLat = end[1] - start[1];
        const bearing = Math.atan2(dLng, dLat) * (180 / Math.PI);

        // Marker rotation=0 means text reads left-to-right (east).
        // rotation = bearing - 90 aligns text along the road.
        let rotation = bearing - 90;
        // Keep text right-side-up (never upside-down)
        if (rotation > 90) rotation -= 180;
        if (rotation < -90) rotation += 180;

        // Title-case the street name for a professional look
        const displayName = name
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .replace(/\bSt\./gi, 'St.')
          .replace(/\bSr\b/gi, 'Sr.');

        return { name: displayName, longitude, latitude, rotation };
      })
      .filter(Boolean);
  }, []);

  // Function to rotate map by 180 degrees
  const rotate180 = useCallback(() => {
    setViewState(prev => ({
      ...prev,
      bearing: (prev.bearing + 180) % 360,
    }));
  }, []);

  // Handle map load to ensure style is ready
  const onMapLoad = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();

    // Mark style as loaded immediately on map load — the style is ready at this point
    setMapStyleLoaded(true);

    // Fly to the default campus overview position
    map.flyTo({
      center: [BUKSU_CAMPUS.center.lng, BUKSU_CAMPUS.center.lat],
      zoom: BUKSU_CAMPUS.zoom,
      pitch: BUKSU_CAMPUS.pitch,
      bearing: BUKSU_CAMPUS.bearing,
      duration: 1200,
      essential: true,
    });
    map.once('moveend', () => {
      const center = map.getCenter();
      setViewState((prev) => ({
        ...prev,
        longitude: center.lng,
        latitude: center.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      }));
    });
    
    // Also listen for style.load in case the style is swapped later
    const handleStyleLoad = () => {
      setMapStyleLoaded(true);
    };
    
    map.on('style.load', handleStyleLoad);

    // Error handling for style/map issues
    map.on('error', (e) => {
      console.error('Mapbox error:', e.error?.message || e.message || e);
    });
    
    return () => {
      map.off('style.load', handleStyleLoad);
    };
  }, []);

  // Check system status (maintenance mode / kiosk status)
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const data = await settingsAPI.getStatus();
        setSystemStatus(data);
      } catch (err) {
        console.warn('Could not fetch system status:', err);
      } finally {
        setStatusLoading(false);
      }
    };
    checkStatus();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const handleOrientation = (event) => {
      const alpha = event?.alpha;
      if (typeof alpha !== 'number') return;
      const normalized = ((360 - alpha) % 360 + 360) % 360;
      if (isMounted) {
        setHeading(normalized);
      }
    };

    const setupOrientation = async () => {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation, true);
          }
        } else {
          window.addEventListener('deviceorientation', handleOrientation, true);
        }
      } catch (err) {
        console.warn('Device orientation not available:', err);
      }
    };

    setupOrientation();

    return () => {
      isMounted = false;
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, []);

  useEffect(() => {
    // Update bearing based on device orientation
    setViewState(prev => ({
      ...prev,
      bearing: heading,
    }));
  }, [heading]);

  const flyToLocation = useCallback((lat, lng, zoom = 20) => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: zoom,
        duration: 1500,
        essential: true,
      });
    } else {
      setViewState(prev => ({
        ...prev,
        longitude: lng,
        latitude: lat,
        zoom: zoom,
      }));
    }
  }, []);

  const getCoords = useCallback((entity) => {
    const geom = entity?.geometry;
    const coords = geom?.coordinates;
    if (!coords) return null;

    const normalizePoint = (value) => {
      if (Array.isArray(value) && value.length >= 2) {
        const [lng, lat] = value;
        if (typeof lat === 'number' && typeof lng === 'number') {
          return { lat, lng };
        }
      }
      if (typeof value === 'object' && value !== null) {
        const lat = value.lat ?? value.latitude;
        const lng = value.lng ?? value.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') {
          return { lat, lng };
        }
      }
      if (typeof value === 'string' && value.includes(',')) {
        const [latStr, lngStr] = value.split(',').map((part) => part.trim());
        const lat = Number(latStr);
        const lng = Number(lngStr);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return { lat, lng };
        }
      }
      return null;
    };

    if (geom.type === 'Point') {
      return normalizePoint(coords);
    }

    if (geom.type === 'Polygon') {
      // Compute centroid of the polygon for better accuracy
      if (Array.isArray(coords?.[0]) && Array.isArray(coords[0][0])) {
        const ring = coords[0];
        let lngSum = 0, latSum = 0, count = 0;
        for (const pt of ring) {
          if (Array.isArray(pt) && pt.length >= 2) {
            lngSum += pt[0];
            latSum += pt[1];
            count++;
          }
        }
        if (count > 0) {
          return { lat: latSum / count, lng: lngSum / count };
        }
        return normalizePoint(coords[0][0]);
      }
      if (Array.isArray(coords?.[0])) {
        return normalizePoint(coords[0]);
      }
    }

    if (geom.type === 'LineString' && Array.isArray(coords?.[0])) {
      return normalizePoint(coords[0]);
    }

    return null;
  }, []);

  // Routing — use walkable-path A* (primary), Mapbox Directions as fallback
  const computeRoute = useCallback(async (startLng, startLat, endLng, endLat) => {
    console.log('🚀 DIRECTIONS FUNCTION STARTED');
    console.log('📍 Start coordinates:', { startLng, startLat });
    console.log('📍 End coordinates:', { endLng, endLat });

    setNavigationError(null);

    // ── Walkable-path A* only — NO Mapbox Directions API ─────────
    try {
      // Pass raw coordinates directly — works even from outside campus
      const pathResult = findCampusRoute(startLng, startLat, endLng, endLat);

      if (!pathResult.error && pathResult.geometry) {
        console.log('✅ Using walkable-path A* route');
        return {
          geometry: pathResult.geometry,
          distance: pathResult.distance,
          duration: pathResult.duration,
          steps: pathResult.steps,
        };
      }
      console.warn('⚠️ Walkable-path A* routing failed:', pathResult.error);
    } catch (err) {
      console.error('💥 Walkable-path A* routing error:', err);
    }

    setNavigationError('No walkable path found between locations within campus.');
    return null;
  }, []);

  // Helper: request geolocation with fallback (try high accuracy, then low accuracy)
  const requestCurrentPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      let resolved = false;

      // Attempt 1: low accuracy (fast, uses WiFi/cell)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!resolved) {
            resolved = true;
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
        },
        () => {
          // Attempt 2: try again with different settings
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!resolved) {
                resolved = true;
                resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              }
            },
            (err2) => {
              if (!resolved) {
                resolved = true;
                reject(err2);
              }
            },
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
          );
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    });
  }, []);

  // Start navigation to a building/entity
  const startNavigation = useCallback(async (targetEntity, targetName) => {
    // If entity belongs to a building, navigate to the building's coordinates
    const buildingId = targetEntity.building?._id || targetEntity.building;
    const parentBuilding = buildingId ? buildings.find(b => b._id === buildingId) : null;
    const navEntity = parentBuilding || targetEntity;
    const navName = targetName || (parentBuilding ? `${parentBuilding.name} (${targetEntity.name})` : targetEntity.name);
    const coords = getCoords(navEntity);
    if (!coords) {
      setNavigationError('Destination coordinates not available.');
      return;
    }

    let loc = userLocation;

    // If location not available, request it (triggers browser permission prompt)
    if (!loc) {
      setLocationDenied(false);
      setLocationPromptVisible(true);
      setPendingNavTarget({ entity: targetEntity, name: targetName });
      try {
        loc = await requestCurrentPosition();
      } catch (permErr) {
        if (permErr && permErr.code === 1) {
          // PERMISSION_DENIED — show persistent blocked dialog
          setLocationPromptVisible(false);
          setPendingNavTarget(null);
          setLocationDenied(true);
          return;
        }
        // Timeout / unavailable — fall through to generic error below
      }
      setLocationPromptVisible(false);
      setPendingNavTarget(null);
    }

    // If still no location, show a helpful non-blocking message and exit
    if (!loc) {
      setNavigationError('Could not get your location. Make sure location is enabled in your device settings and browser, then try again.');
      // Auto-dismiss after 5 seconds
      setTimeout(() => setNavigationError((prev) =>
        prev && prev.startsWith('Could not') ? null : prev
      ), 5000);
      return;
    }

    const result = await computeRoute(
      loc.lng, loc.lat,
      coords.lng, coords.lat
    );
    if (result) {
      // Store destination for live re-routing
      navDestRef.current = { lng: coords.lng, lat: coords.lat };
      setNavigationRoute(result.geometry);
      setNavigationSteps(result.steps);
      setNavigationSummary({
        distance: result.distance,
        duration: result.duration,
      });
      setNavigationTarget(parentBuilding ? parentBuilding.name : (targetName || targetEntity.name));
      setNavigationDisplayName(navName);
      setIsNavigating(true);
      setShowInstructions(true);
      // On mobile: collapse bottom sheet so the map and nav panel are visible
      if (isMobile) {
        setSheetSnap('peek');
        setChatbotOpacity(1);
      }
      // Fit map to show the full route
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        const routeCoords = result.geometry.coordinates;
        const bounds = routeCoords.reduce(
          (b, coord) => b.extend(coord),
          new mapboxgl.LngLatBounds(routeCoords[0], routeCoords[0])
        );
        map.fitBounds(bounds, { padding: 80, duration: 1000, maxZoom: 19 });
      }
    }
  }, [userLocation, getCoords, computeRoute, requestCurrentPosition, isMobile, buildings]);

  // Ref to hold the current navigation destination coords for live re-routing
  const navDestRef = useRef(null);

  // Stop navigation and clear route
  const stopNavigation = useCallback(() => {
    setNavigationRoute(null);
    setNavigationSteps([]);
    setNavigationSummary(null);
    setIsNavigating(false);
    setNavigationTarget(null);
    setNavigationDisplayName(null);
    setNavigationError(null);
    setShowInstructions(false);
    navDestRef.current = null;
  }, []);

  // Live re-route: when user location changes during navigation, recompute route
  useEffect(() => {
    if (!isNavigating || !userLocation || !navDestRef.current) return;
    let cancelled = false;
    const { lng: endLng, lat: endLat } = navDestRef.current;

    (async () => {
      const result = await computeRoute(userLocation.lng, userLocation.lat, endLng, endLat);
      if (!cancelled && result) {
        setNavigationRoute(result.geometry);
        setNavigationSteps(result.steps);
        setNavigationSummary({ distance: result.distance, duration: result.duration });
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, isNavigating]);

  // Format meters to readable distance
  const formatDistance = useCallback((meters) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }, []);

  // Format seconds to readable duration
  const formatDuration = useCallback((seconds) => {
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs} hr ${remainMins} min`;
  }, []);

  // Get maneuver icon for turn-by-turn instructions
  const getManeuverIcon = useCallback((modifier) => {
    switch (modifier) {
      case 'left': return '↰';
      case 'right': return '↱';
      case 'sharp left': return '⤺';
      case 'sharp right': return '⤻';
      case 'slight left': return '↖';
      case 'slight right': return '↗';
      case 'straight': return '↑';
      case 'uturn': return '↩';
      default: return '→';
    }
  }, []);

  const resetToOverview = useCallback(() => {
    setSelectedItemId(null);
    setSelectedItemType(null);
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [BUKSU_CAMPUS.center.lng, BUKSU_CAMPUS.center.lat],
        zoom: BUKSU_CAMPUS.zoom,
        pitch: BUKSU_CAMPUS.pitch,
        bearing: BUKSU_CAMPUS.bearing,
        duration: 1200,
        essential: true,
      });
    } else {
      setViewState(prev => ({
        ...prev,
        longitude: BUKSU_CAMPUS.center.lng,
        latitude: BUKSU_CAMPUS.center.lat,
        zoom: BUKSU_CAMPUS.zoom,
        pitch: BUKSU_CAMPUS.pitch,
        bearing: BUKSU_CAMPUS.bearing,
      }));
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [buildingsData, officesData, facultyData, roomsData] = await Promise.all([
          buildingsAPI.getAll().catch(() => []),
          officesAPI.getAll().catch(() => []),
          facultyAPI.getAll().catch(() => []),
          roomsAPI.getAll().catch(() => []),
        ]);
        setBuildings(buildingsData);
        setOffices(officesData);
        setFaculty(facultyData);
        setRooms(roomsData);
      } catch (error) {
        console.error('Error loading map data:', error);
      }
    };
    loadData();
  }, []);

  const normalizedSidebarQuery = sidebarQuery.trim().toLowerCase();
  const matchesSidebarQuery = useCallback((value) => {
    if (!normalizedSidebarQuery) return true;
    if (!value) return false;
    return value.toString().toLowerCase().includes(normalizedSidebarQuery);
  }, [normalizedSidebarQuery]);

  const activeBuildingIds = useMemo(() => {
    return new Set(buildings.filter(b => b.isActive !== false).map(b => b._id));
  }, [buildings]);

  const filteredRooms = useMemo(() => {
    return rooms
      .filter((room) => room.isActive !== false && (!room.building?._id || activeBuildingIds.has(room.building._id)))
      .filter((room) => matchesSidebarQuery(room.name || room.building?.name))
      .slice(0, 60);
  }, [rooms, matchesSidebarQuery, activeBuildingIds]);

  const filteredOffices = useMemo(() => {
    return offices
      .filter((office) => office.isActive !== false && (!office.building?._id || activeBuildingIds.has(office.building._id)))
      .filter((office) => matchesSidebarQuery(office.name || office.building?.name))
      .slice(0, 60);
  }, [offices, matchesSidebarQuery, activeBuildingIds]);

  const handleSidebarNavigate = useCallback((entity, entityType, fallbackEntity) => {
    const coords = getCoords(entity) || getCoords(fallbackEntity);

    // Track selected item
    setSelectedItemId(entity._id);
    setSelectedItemType(entityType);
    
    // Open quick nav panel for buildings with enriched data
    if (entityType === 'building') {
      const enrichedBuilding = {
        ...entity,
        rooms: rooms.filter(r => r.building?._id === entity._id),
        offices: offices.filter(o => o.building?._id === entity._id),
      };
      setQuickNavBuilding(enrichedBuilding);
      setIsQuickNavOpen(true);
      if (isMobile) {
        setSheetSnap('full');
        setTimeout(() => { detailsContentRef.current?.scrollTo({ top: 0 }); }, 50);
      }
    } else if (entityType === 'office' && fallbackEntity) {
      const enrichedBuilding = {
        ...fallbackEntity,
        rooms: rooms.filter(r => r.building?._id === fallbackEntity._id),
        offices: offices.filter(o => o.building?._id === fallbackEntity._id),
      };
      setQuickNavBuilding(enrichedBuilding);
      setIsQuickNavOpen(true);
      if (isMobile) {
        setSheetSnap('full');
        setTimeout(() => { detailsContentRef.current?.scrollTo({ top: 0 }); }, 50);
      }
    } else if (entityType === 'room' && fallbackEntity) {
      const enrichedBuilding = {
        ...fallbackEntity,
        rooms: rooms.filter(r => r.building?._id === fallbackEntity._id),
        offices: offices.filter(o => o.building?._id === fallbackEntity._id),
      };
      setQuickNavBuilding(enrichedBuilding);
      setIsQuickNavOpen(true);
      if (isMobile) {
        setSheetSnap('full');
        setTimeout(() => { detailsContentRef.current?.scrollTo({ top: 0 }); }, 50);
      }
    }
    
    // Update recent locations
    setRecentLocations((prev) => {
      const newRecent = [
        { id: entity._id, name: entity.name, type: entityType, timestamp: Date.now() },
        ...prev.filter((item) => item.id !== entity._id),
      ].slice(0, 10);
      try {
        localStorage.setItem('alagad-recent-locations', JSON.stringify(newRecent));
      } catch {
        console.warn('Could not save recent locations');
      }
      return newRecent;
    });
    
    // Fly to location on map if coordinates exist — but skip if already viewing this building
    if (coords && selectedItemId !== entity._id) {
      flyToLocation(coords.lat, coords.lng);
    }
  }, [flyToLocation, getCoords, rooms, offices, isMobile, selectedItemId]);

  // Show maintenance or offline screen
  const isUnavailable = systemStatus.maintenanceMode || systemStatus.kioskStatus === 'offline' || systemStatus.kioskStatus === 'maintenance';

  if (statusLoading) {
    return (
      <div className="App guest-view">
        <div className="guest-status-screen">
          <div className="guest-status-spinner"></div>
          <p style={{ marginTop: 16, color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (isUnavailable) {
    const isMaintenance = systemStatus.maintenanceMode || systemStatus.kioskStatus === 'maintenance';
    return (
      <div className="App guest-view">
        <div className="guest-status-screen">
          <div className="guest-status-icon">
            {isMaintenance ? (
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M14.828 3.34L21.19 16.26c.89 1.73-.22 3.74-2.19 3.74H5c-1.97 0-3.08-2.01-2.19-3.74L9.17 3.34c.9-1.74 3.26-1.74 4.16 0z" />
              </svg>
            ) : (
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6" />
                <path d="M9 9l6 6" />
              </svg>
            )}
          </div>
          <h1 className="guest-status-title">
            {isMaintenance ? 'Under Maintenance' : 'System Offline'}
          </h1>
          <p className="guest-status-message">
            {isMaintenance
              ? 'The campus navigation system is currently undergoing maintenance. Please check back later.'
              : 'The campus navigation system is currently offline. Please try again later.'}
          </p>
          <button
            className="guest-status-back-btn"
            onClick={() => window.history.back()}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Shared sidebar/bottom-sheet content
  const navigationContent = (
    <>
      {isQuickNavOpen && quickNavBuilding ? (
        // Quick Nav Details View
        <>
          <div className="quick-nav-header">
            <button
              className="quick-nav-back-btn"
              onClick={() => {
                setIsQuickNavOpen(false);
                setQuickNavBuilding(null);
                resetToOverview();
              }}
              aria-label="Back to search"
              title="Back"
            >
              <BackIcon size={14} /> Back
            </button>
          </div>
          
          <div className="quick-nav-details-content" ref={detailsContentRef}>
            {/* Hero Image */}
            {quickNavBuilding.image ? (
              <div className="bv-hero-image">
                <img src={quickNavBuilding.image} alt={quickNavBuilding.name} />
              </div>
            ) : (
              <div className="bv-hero-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M12 12v3"/><path d="M8 12v3"/><path d="M16 12v3"/></svg>
              </div>
            )}

            {/* Building Info */}
            <div className="bv-info-section">
              <div className="bv-title-row">
                <h2 className="bv-name">{quickNavBuilding.name}</h2>
                <button
                  className={`bv-navigate-btn${isNavigating && navigationTarget === quickNavBuilding.name ? ' bv-navigate-btn--active' : ''}`}
                  onClick={() => startNavigation(quickNavBuilding, quickNavBuilding.name)}
                  title="Get walking directions"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
                  {isNavigating && navigationTarget === quickNavBuilding.name ? 'Navigating...' : 'Navigate'}
                </button>
              </div>
              <div className="bv-meta">
                {quickNavBuilding.numberOfFloors && (
                  <span className="bv-meta-tag">🏢 {quickNavBuilding.numberOfFloors} Floor{quickNavBuilding.numberOfFloors > 1 ? 's' : ''}</span>
                )}
                {quickNavBuilding.department && (
                  <span className="bv-meta-tag">🏛️ {quickNavBuilding.department}</span>
                )}
              </div>
              {quickNavBuilding.description && (
                <p className="bv-description">{quickNavBuilding.description}</p>
              )}
            </div>

            {/* Floor Tabs + Content */}
            {(() => {
              const allRooms = quickNavBuilding.rooms || [];
              const allOffices = quickNavBuilding.offices || [];
              if (allRooms.length === 0 && allOffices.length === 0) return null;

              const floorCount = quickNavBuilding.numberOfFloors || 1;
              const floors = Array.from({ length: floorCount }, (_, i) => i + 1);
              const ordinal = (f) => f === 1 ? '1st' : f === 2 ? '2nd' : f === 3 ? '3rd' : `${f}th`;

              const roomsByFloor = {};
              const officesByFloor = {};
              allRooms.forEach(r => { const f = r.floor || 1; if (!roomsByFloor[f]) roomsByFloor[f] = []; roomsByFloor[f].push(r); });
              allOffices.forEach(o => { const f = o.floor || 1; if (!officesByFloor[f]) officesByFloor[f] = []; officesByFloor[f].push(o); });

              const activeFloor = floors.includes(selectedFloor) ? selectedFloor : floors[0];
              const floorOffices = officesByFloor[activeFloor] || [];
              const floorRooms = roomsByFloor[activeFloor] || [];

              return (
                <div className="bv-floors-section">
                  <div className="bv-floors-label">Building Directory</div>
                  <div className="bv-floor-tabs">
                    {floors.map(floor => (
                      <button
                        key={floor}
                        className={`bv-floor-tab${activeFloor === floor ? ' active' : ''}`}
                        onClick={() => setSelectedFloor(floor)}
                      >
                        {ordinal(floor)} Floor
                      </button>
                    ))}
                  </div>
                  <div className="bv-floor-content">
                    {floorOffices.length > 0 && (
                      <div>
                        <h4 className="bv-section-label">Offices</h4>
                        <div className="bv-cards-grid">
                          {floorOffices.map((office, idx) => (
                            <div key={office._id || idx} className="bv-card bv-card--office">
                              <div className="bv-card-icon">💼</div>
                              <div className="bv-card-name">{office.name}</div>
                              {office.head && <div className="bv-card-sub">{office.head}</div>}
                              {office.department && <div className="bv-card-sub">{office.department}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {floorRooms.length > 0 && (
                      <div>
                        <h4 className="bv-section-label">Rooms</h4>
                        <div className="bv-cards-grid">
                          {floorRooms.map((room, idx) => (
                            <div key={room._id || idx} className="bv-card bv-card--room">
                              <div className="bv-card-icon">🚪</div>
                              <div className="bv-card-name">{room.name}</div>
                              {room.capacity && <div className="bv-card-sub">Cap. {room.capacity}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {floorOffices.length === 0 && floorRooms.length === 0 && (
                      <div className="bv-floor-empty">No offices or rooms on this floor.</div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      ) : (
        // Rooms & Offices List View
        <>
          <div className="guest-sidebar-search">
            <input
              ref={sidebarInputRef}
              type="text"
              placeholder="Search rooms, offices..."
              value={sidebarQuery}
              onChange={(e) => setSidebarQuery(e.target.value)}
              onFocus={() => { if (isMobile && sheetSnap === 'peek') setSheetSnap('half'); }}
            />
          </div>
          {sidebarQuery && (
            <div className="sidebar-results-info">
              {filteredRooms.length + filteredOffices.length} results for "{sidebarQuery}"
            </div>
          )}
          <div className="guest-sidebar-content">
          <section className="guest-sidebar-section">
            <div className="guest-sidebar-section-header">
              <h3>Rooms</h3>
              <div className="section-header-right">
                <span>{filteredRooms?.length || 0}</span>
                <button 
                  className="section-collapse-btn"
                  onClick={() => setRoomsCollapsed(!roomsCollapsed)}
                  aria-label={roomsCollapsed ? "Expand rooms" : "Collapse rooms"}
                >
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 16 16" 
                    fill="none" 
                    style={{ transform: roomsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                  >
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            {!roomsCollapsed && (
            <ul>
              {filteredRooms.map((room) => {
                const isSelected = selectedItemId === room._id && selectedItemType === 'room';
                const roomType = room.type || 'Classroom';
                return (
                  <li key={room._id || room.name}>
                    <button
                      type="button"
                      className={`sidebar-link ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSidebarNavigate(room, 'room', room.building)}
                      title={room.name}
                    >
                      <div className="sidebar-link-header">
                        <span className="sidebar-link-title">{room.name}</span>
                      </div>
                      <div className="sidebar-link-details">
                        {room.building?.name && (
                          <span className="sidebar-detail">{room.building.name}</span>
                        )}
                        <span className="sidebar-detail sidebar-type-badge">{roomType}</span>
                      </div>
                      {room.floor && (
                        <div className="sidebar-link-department">Floor {room.floor}</div>
                      )}
                      {room.capacity && (
                        <div className="sidebar-link-capacity">Cap. {room.capacity}</div>
                      )}
                    </button>
                  </li>
                );
              })}
              {filteredRooms.length === 0 && (
                <li className="sidebar-empty">No rooms found.</li>
              )}
            </ul>
            )}
          </section>

          <section className="guest-sidebar-section">
            <div className="guest-sidebar-section-header">
              <h3>Offices</h3>
              <div className="section-header-right">
                <span>{filteredOffices?.length || 0}</span>
                <button 
                  className="section-collapse-btn"
                  onClick={() => setOfficesCollapsed(!officesCollapsed)}
                  aria-label={officesCollapsed ? "Expand offices" : "Collapse offices"}
                >
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 16 16" 
                    fill="none" 
                    style={{ transform: officesCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                  >
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            {!officesCollapsed && (
            <ul>
              {filteredOffices.map((office) => {
                const isSelected = selectedItemId === office._id && selectedItemType === 'office';
                return (
                  <li key={office._id || office.name}>
                    <button
                      type="button"
                      className={`sidebar-link ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSidebarNavigate(office, 'office', office.building)}
                      title={office.name}
                    >
                      <div className="sidebar-link-header">
                        <span className="sidebar-link-title">{office.name}</span>
                      </div>
                      <div className="sidebar-link-details">
                        {office.building?.name && (
                          <span className="sidebar-detail">{office.building.name}</span>
                        )}
                        {office.department && (
                          <span className="sidebar-detail sidebar-dept-badge">{office.department}</span>
                        )}
                      </div>
                      {office.floor && (
                        <div className="sidebar-link-department">Floor {office.floor}</div>
                      )}
                      {office.head && (
                        <div className="sidebar-link-department">{office.head}</div>
                      )}
                    </button>
                  </li>
                );
              })}
              {filteredOffices.length === 0 && (
                <li className="sidebar-empty">No offices found.</li>
              )}
            </ul>
            )}
          </section>
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="App guest-view">
      <header className="guest-header">
        <div className="guest-header-content">
          <h1>ALAGAD</h1>
          <p>Campus Navigation</p>
        </div>
      </header>
      <main className="guest-main">
        {/* Desktop sidebar */}
        <aside className={`guest-sidebar desktop-sidebar ${isSidebarOpen ? 'open' : 'closed'}`} aria-label="Quick navigation">
          <div className="guest-sidebar-header">
            <div>
              <h2>Navigation</h2>
              <p>Buildings, rooms &amp; offices</p>
            </div>
          </div>
          {navigationContent}
        </aside>

        {/* Desktop Sidebar Toggle Button */}
        <button
          className={`sidebar-toggle-btn ${isSidebarOpen ? 'open' : 'closed'}`}
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          title={isSidebarOpen ? 'Hide navigation' : 'Show navigation'}
          aria-label="Toggle sidebar"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {isSidebarOpen ? (
              <path d="M15 19l-7-7 7-7" />
            ) : (
              <path d="M9 19l7-7-7-7" />
            )}
          </svg>
        </button>

        <div className="guest-map-area">
          <div ref={wrapperRef} className="map-wrapper">
            <Map
              ref={mapRef}
              {...viewState}
              onMove={(evt) => setViewState(evt.viewState)}
              mapboxAccessToken={MAPBOX_TOKEN}
              style={{ width: '100%', height: '100%' }}
              mapStyle="mapbox://styles/zach-2002/cmmfqzvkr000w01sp0vw694hy"
              maxBounds={CAMPUS_BOUNDS}
              onLoad={onMapLoad}
              onError={(e) => console.error('Map error:', e)}
              onClick={(e) => {
                // If no feature was clicked (empty map area), zoom back out
                if (!e.features || e.features.length === 0) {
                  if (selectedItemId || isQuickNavOpen) {
                    setIsQuickNavOpen(false);
                    setQuickNavBuilding(null);
                    resetToOverview();
                  }
                }
              }}
              minZoom={16}
              maxZoom={20}
            >
              {/* Dim everything OUTSIDE the campus boundary — campus interior stays clear */}
              {mapStyleLoaded && (
                <>
                  <Source
                    id="campus-boundary-mask"
                    type="geojson"
                    data={{
                      type: 'Feature',
                      geometry: {
                        type: 'Polygon',
                        // Outer ring covers the world; inner ring (hole) is the campus
                        coordinates: [
                          [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]],
                          ...FOCUS_POLYGON,
                        ],
                      },
                    }}
                  >
                    {/* Dark overlay outside campus */}
                    <Layer
                      id="campus-outside-mask"
                      type="fill"
                      paint={{
                        'fill-color': '#000000',
                        'fill-opacity': 0.5,
                      }}
                    />
                  </Source>

                </>
              )}

              {/* Walkable routes — gray lines showing all walkable paths */}
              {mapStyleLoaded && (() => {
                const walkableData = getWalkablePathsGeoJSON();
                if (!walkableData?.features?.length) return null;
                return (
                  <Source id="walkable-routes-src" type="geojson" data={walkableData}>
                    <Layer
                      id="walkable-routes"
                      type="line"
                      filter={['==', '$type', 'LineString']}
                      paint={{
                        'line-color': '#9ca3af',
                        'line-width': 2,
                        'line-opacity': 0,
                        'line-dasharray': [2, 3],
                      }}
                      layout={{
                        'line-cap': 'round',
                        'line-join': 'round',
                      }}
                    />
                  </Source>
                );
              })()}

              {/* Street line guides */}
              {mapStyleLoaded && streetNamesGeoJSON?.features?.length > 0 && (
                <Source id="street-names-src" type="geojson" data={streetNamesGeoJSON}>
                  <Layer
                    id="street-names-lines"
                    type="line"
                    paint={{
                      'line-color': '#ffffff',
                      'line-width': 2,
                      'line-opacity': 0,
                    }}
                    layout={{
                      'line-cap': 'round',
                      'line-join': 'round',
                    }}
                  />
                </Source>
              )}

              {/* User location marker — pulsing blue dot */}
              {mapStyleLoaded && userLocation && (
                <Marker
                  longitude={userLocation.lng}
                  latitude={userLocation.lat}
                  anchor="center"
                >
                  <div className="user-location-marker">
                    <div className="user-location-pulse" />
                    <div className="user-location-dot" />
                    {heading > 0 && (
                      <div
                        className="user-location-heading"
                        style={{ transform: `rotate(${heading}deg)` }}
                      />
                    )}
                  </div>
                </Marker>
              )}

              {/* Campus features GeoJSON */}
              {mapStyleLoaded && mapFeatures?.features?.length > 0 && (
                <SafeGeoJSON data={mapFeatures} />
              )}

              {/* Street name labels aligned to road lines */}
              {mapStyleLoaded && streetLabelPoints.length > 0 &&
                streetLabelPoints.map((label, index) => (
                  <Marker
                    key={`street-label-${label.name}-${index}`}
                    longitude={label.longitude}
                    latitude={label.latitude}
                    anchor="center"
                    rotation={label.rotation}
                    rotationAlignment="map"
                  >
                    <div
                      style={{
                        color: '#ffffff',
                        fontSize: '9px',
                        fontWeight: 600,
                        fontFamily: "'Inter', 'Segoe UI', sans-serif",
                        letterSpacing: '0.4px',
                        whiteSpace: 'nowrap',
                        textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 3px #000',
                        pointerEvents: 'none',
                        userSelect: 'none',
                      }}
                    >
                      {label.name}
                    </div>
                  </Marker>
                ))}

              {/* Building markers with popups */}
              {mapStyleLoaded && buildings?.length > 0 && (
                <BuildingMarkers
                  buildings={buildings.filter(b => b.isActive !== false)}
                  selectedBuildingId={selectedItemType === 'building' ? selectedItemId : null}
                  isNavigating={isNavigating}
                  navigationTarget={navigationTarget}
                  onMarkerClick={(building) => {
                    setSelectedItemId(building._id);
                    setSelectedItemType('building');
                    const coords = getCoords(building);
                    if (coords) {
                      flyToLocation(coords.lat, coords.lng, 19);
                    }
                  }}
                  onViewDetails={(building) => {
                    handleSidebarNavigate(building, 'building');
                  }}
                  onNavigate={(building, name) => startNavigation(building, name)}
                  onPopupClose={resetToOverview}
                />
              )}

              {/* Office markers with teardrop pins (matching MapEditor style) */}
              {mapStyleLoaded && offices?.length > 0 && offices.filter(o => o.geometry?.coordinates).map((office) => {
                const coords = getCoords(office);
                if (!coords) return null;
                const isSelected = selectedItemId === office._id && selectedItemType === 'office';
                return (
                  <React.Fragment key={`office-${office._id}`}>
                    <Marker
                      longitude={coords.lng}
                      latitude={coords.lat}
                      anchor="center"
                      onClick={(e) => {
                        e.originalEvent.stopPropagation();
                        setSelectedItemId(office._id);
                        setSelectedItemType('office');
                        setPopupOffice(office);
                        flyToLocation(coords.lat, coords.lng, 19);
                      }}
                    >
                      <BoxMarker
                        name={office.name}
                        color={office.markerColor || office.color || '#8b5cf6'}
                        isSelected={isSelected}
                      />
                    </Marker>
                    {popupOffice?._id === office._id && (
                      <Popup
                        longitude={coords.lng}
                        latitude={coords.lat}
                        anchor="top"
                        offset={[0, 16]}
                        closeOnClick={false}
                        onClose={() => { setPopupOffice(null); resetToOverview(); }}
                      >
                        <div style={{ padding: '12px', minWidth: '200px' }}>
                          <h4 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>{office.name}</h4>
                          {office.building?.name && (
                            <p style={{ margin: '0 0 2px', fontSize: '12px', color: '#6b7280' }}>
                              <span style={{ fontWeight: '600' }}>📍 Building:</span> {office.building.name}
                            </p>
                          )}
                          {office.floor && (
                            <p style={{ margin: '0 0 2px', fontSize: '12px', color: '#6b7280' }}>
                              <span style={{ fontWeight: '600' }}>🏢 Floor:</span> {office.floor}
                            </p>
                          )}
                          {office.head && (
                            <p style={{ margin: '0 0 2px', fontSize: '12px', color: '#6b7280' }}>
                              <span style={{ fontWeight: '600' }}>👤 Head:</span> {office.head}
                            </p>
                          )}
                          {office.department && (
                            <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280' }}>
                              <span style={{ fontWeight: '600' }}>🏛️ Dept:</span> {office.department}
                            </p>
                          )}
                          {office.description && (
                            <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280' }}>
                              {office.description}
                            </p>
                          )}
                          <button
                            onClick={() => {
                              startNavigation(office, office.name);
                              setPopupOffice(null);
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              background: '#16a34a',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#15803d';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#16a34a';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                            title="Get walking directions"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
                            Navigate Here
                          </button>
                          <button
                            onClick={() => {
                              handleSidebarNavigate(office, 'office', office.building);
                              setPopupOffice(null);
                            }}
                            style={{
                              width: '100%',
                              marginTop: '6px',
                              padding: '8px 12px',
                              background: '#2F6DE1',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background = '#2557B8';
                              e.target.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background = '#2F6DE1';
                              e.target.style.transform = 'translateY(0)';
                            }}
                            title="View full details"
                          >
                            View More Details →
                          </button>
                        </div>
                      </Popup>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Navigation route line — red route along walkable paths, only visible during navigation */}
              {mapStyleLoaded && isNavigating && navigationRoute && (
                <Source
                  id="navigation-route"
                  type="geojson"
                  data={{
                    type: 'Feature',
                    geometry: navigationRoute,
                  }}
                >
                  {/* Outer glow — soft red halo for depth */}
                  <Layer
                    id="navigation-route-glow"
                    type="line"
                    paint={{
                      'line-color': '#EF4444',
                      'line-width': 18,
                      'line-opacity': 0.15,
                      'line-blur': 8,
                    }}
                    layout={{
                      'line-join': 'round',
                      'line-cap': 'round',
                    }}
                  />
                  {/* Dark outline / casing — darker red border */}
                  <Layer
                    id="navigation-route-casing"
                    type="line"
                    paint={{
                      'line-color': '#B91C1C',
                      'line-width': 10,
                      'line-opacity': 0.45,
                    }}
                    layout={{
                      'line-join': 'round',
                      'line-cap': 'round',
                    }}
                  />
                  {/* Main route line — bold red */}
                  <Layer
                    id="navigation-route-line"
                    type="line"
                    paint={{
                      'line-color': '#EF4444',
                      'line-width': 6,
                      'line-opacity': 1,
                    }}
                    layout={{
                      'line-join': 'round',
                      'line-cap': 'round',
                    }}
                  />
                </Source>
              )}

              {/* Navigation origin marker (user start point) — Google Maps green dot */}
              {mapStyleLoaded && isNavigating && navigationRoute && (() => {
                const routeCoords = navigationRoute.coordinates;
                const origin = routeCoords[0];
                if (!origin) return null;
                return (
                  <Marker longitude={origin[0]} latitude={origin[1]} anchor="center">
                    <div style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: '#0F9D58',
                      border: '3px solid #ffffff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }} />
                  </Marker>
                );
              })()}

              {/* Navigation destination pin — Google Maps red pin */}
              {mapStyleLoaded && isNavigating && navigationRoute && (() => {
                const routeCoords = navigationRoute.coordinates;
                const dest = routeCoords[routeCoords.length - 1];
                if (!dest) return null;
                return (
                  <Marker longitude={dest[0]} latitude={dest[1]} anchor="bottom">
                    <svg width="36" height="48" viewBox="0 0 36 48" fill="none">
                      <filter id="pin-shadow" x="-2" y="-1" width="40" height="54">
                        <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3" />
                      </filter>
                      <g filter="url(#pin-shadow)">
                        <path d="M18 0C8.059 0 0 8.059 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.059 27.941 0 18 0z" fill="#EA4335"/>
                        <circle cx="18" cy="18" r="8" fill="#fff"/>
                        <circle cx="18" cy="18" r="4" fill="#EA4335"/>
                      </g>
                    </svg>
                  </Marker>
                );
              })()}

            </Map>

            {/* Navigation Error */}
            {navigationError && (
              <div className="navigation-error">
                <span>{navigationError}</span>
                <button onClick={() => setNavigationError(null)}>✕</button>
              </div>
            )}

            {/* Reset View (Home) button */}
            <button
              ref={resetBtnRef}
              className="reset-view-btn"
              onClick={resetToOverview}
              title="Reset to default view"
              style={isMobile ? {
                bottom: `calc(${getSnapHeight(sheetSnap)}vh + 56px)`,
                opacity: sheetSnap === 'full' ? 0 : 1,
                pointerEvents: sheetSnap === 'full' ? 'none' : 'auto',
              } : undefined}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </button>

            {/* My Location button */}
            {userLocation && (
              <button
                className="my-location-btn"
                onClick={() => flyToLocation(userLocation.lat, userLocation.lng, 19)}
                title="Go to my location"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4" />
                  <path d="M12 18v4" />
                  <path d="M2 12h4" />
                  <path d="M18 12h4" />
                </svg>
              </button>
            )}
            {mapLoading && (
              <div style={{ 
                position: 'absolute', 
                top: '50%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)', 
                zIndex: 1000, 
                background: 'rgba(255,255,255,0.98)', 
                padding: '24px 32px', 
                borderRadius: '12px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  border: '3px solid #f0f0f0',
                  borderTop: '3px solid #2c3e50',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} />
                <span style={{ color: '#666', fontSize: '14px', fontWeight: '500' }}>Loading campus features...</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Bottom Sheet (Google Maps style) */}
      <div
        ref={sheetRef}
        className={`mobile-bottom-sheet snap-${sheetSnap}`}
        style={{
          height: `${getSnapHeight(sheetSnap)}vh`,
          ...(isMobile && chatbotOpen ? { display: 'none' } : {}),
        }}
      >
        <div
          className="bottom-sheet-handle"
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
          onClick={() => {
            // Tap to cycle: peek → half → full → peek
            setSheetSnap((prev) => {
              if (prev === 'peek') return 'half';
              if (prev === 'half') return 'full';
              return 'peek';
            });
          }}
        >
          <div className="bottom-sheet-handle-bar" />
        </div>
        {navigationContent}
      </div>
      
      {/* Campus Assistant Chatbot — rendered via portal to escape overflow:hidden */}
      {ReactDOM.createPortal(
        <ChatBot onOpenChange={setChatbotOpen} buildings={buildings} onNavigate={startNavigation} />,
        document.body
      )}

      {/* Location Permission Prompt Overlay */}
      {(locationPromptVisible || locationDenied) && (
        <div className="location-prompt-overlay">
          <div className="location-prompt-card">
            <div className="location-prompt-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={locationDenied ? '#ef4444' : '#4285F4'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
                {locationDenied && <line x1="3" y1="3" x2="21" y2="21" />}
              </svg>
            </div>

            {locationDenied ? (
              <>
                <h3 className="location-prompt-title">Location Access Blocked</h3>
                <p className="location-prompt-text">
                  ALAGAD needs your location to calculate the shortest walking route. Location access has been blocked. To enable it:
                </p>
                <ol className="location-prompt-steps">
                  <li>Tap the <strong>lock / info</strong> icon in your browser address bar</li>
                  <li>Find <strong>Location</strong> and set it to <strong>Allow</strong></li>
                  <li>Reload the page and try navigating again</li>
                </ol>
                <button
                  className="location-prompt-cancel"
                  style={{ background: '#1a73e8', color: 'white', border: 'none', marginTop: 8 }}
                  onClick={() => setLocationDenied(false)}
                >
                  Got it
                </button>
              </>
            ) : (
              <>
                <h3 className="location-prompt-title">Enable Location</h3>
                <p className="location-prompt-text">
                  ALAGAD needs your location to provide the shortest walking route. Please allow location access when prompted by your browser.
                </p>
                <div className="location-prompt-spinner">
                  <div className="location-spinner" />
                  <span>Waiting for location access...</span>
                </div>
                <button
                  className="location-prompt-cancel"
                  onClick={() => {
                    setLocationPromptVisible(false);
                    setPendingNavTarget(null);
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GuestView;
