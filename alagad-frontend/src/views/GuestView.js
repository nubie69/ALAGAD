import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import MapView, { Source, Layer, Marker, Popup } from 'react-map-gl';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import SafeGeoJSON from '../components/SafeGeoJSON';
import BuildingMarkers from '../components/BuildingMarkers';
import { BoxMarker } from '../components/BoxMarker';
import ChatBot from '../components/ChatBot';
import CampusBoundaryFocus from '../components/CampusBoundaryFocus';
import { useMapState } from '../context/MapContext';
import { useAuth } from '../context/AuthContext';
import { buildingsAPI, roomsAPI, officesAPI, facultyAPI, settingsAPI, popularAPI } from '../utils/api';

import '../App.css';
import './GuestView.modern.css';
import { BackIcon, MapPinIconOutline } from '../utils/icons';
import { findCampusRoute, isInsideCampus, nearestPointOnCampus, getWalkablePathsGeoJSON } from '../utils/campusPathfinding';
import streetNamesGeoJSON from '../data/streetNames.json';

// Bukidnon State University campus bounds (Malaybalay, Bukidnon)
const BUKSU_CAMPUS = {
  center: { lat: 8.156363, lng: 125.124143 },
  zoom: 17.72,
  pitch: 0.50,
  bearing: -137.98,
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

const USER_INDICATOR_CONFIG = Object.freeze({
  dotColor: '#2563eb',
  dotSizePx: 8,
  pulseSizePx: 34,
  pulseColorRgb: '37, 99, 235',
  pulseOpacity: 0.22,
  directionColor: '#1d4ed8',
  directionSizePx: 24,
  headingSmoothing: 0.22,
  sensorFusionSmoothing: 0.24,
  positionSmoothingMs: 260,
});

const INDICATOR_LOG_INTERVAL_MS = 1500;

const normalizeAngle = (value) => ((value % 360) + 360) % 360;

const shortestAngleDelta = (from, to) => {
  const start = normalizeAngle(from);
  const end = normalizeAngle(to);
  return ((end - start + 540) % 360) - 180;
};

const smoothHeading = (currentHeading, targetHeading, smoothingFactor = 0.2) => {
  const delta = shortestAngleDelta(currentHeading, targetHeading);
  return normalizeAngle(currentHeading + (delta * smoothingFactor));
};

const weightedHeadingAverage = (samples) => {
  const valid = (samples || [])
    .filter((entry) => Number.isFinite(entry?.heading) && Number.isFinite(entry?.weight) && entry.weight > 0);

  if (valid.length === 0) return null;

  let x = 0;
  let y = 0;

  for (const entry of valid) {
    const rad = (normalizeAngle(entry.heading) * Math.PI) / 180;
    x += Math.cos(rad) * entry.weight;
    y += Math.sin(rad) * entry.weight;
  }

  if (x === 0 && y === 0) return null;
  return normalizeAngle((Math.atan2(y, x) * 180) / Math.PI);
};

const calculateBearing = (from, to) => {
  if (!from || !to) return null;

  const lat1 = (Number(from.lat) * Math.PI) / 180;
  const lat2 = (Number(to.lat) * Math.PI) / 180;
  const dLng = ((Number(to.lng) - Number(from.lng)) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    (Math.cos(lat1) * Math.sin(lat2))
    - (Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng));

  const raw = (Math.atan2(y, x) * 180) / Math.PI;
  return normalizeAngle(raw);
};

const distanceBetweenPointsMeters = (from, to) => {
  const fromLat = Number(from?.lat);
  const fromLng = Number(from?.lng);
  const toLat = Number(to?.lat);
  const toLng = Number(to?.lng);
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const avgLatRad = (((fromLat + toLat) / 2) * Math.PI) / 180;
  const metersPerLng = 111320 * Math.cos(avgLatRad);
  const metersPerLat = 110540;
  const dx = (toLng - fromLng) * metersPerLng;
  const dy = (toLat - fromLat) * metersPerLat;
  return Math.hypot(dx, dy);
};

const projectPointToSegmentMeters = (point, start, end) => {
  const pointLat = Number(point?.lat);
  const pointLng = Number(point?.lng);
  const startLng = Number(start?.[0]);
  const startLat = Number(start?.[1]);
  const endLng = Number(end?.[0]);
  const endLat = Number(end?.[1]);

  if (![pointLat, pointLng, startLng, startLat, endLng, endLat].every(Number.isFinite)) {
    return {
      distanceMeters: Number.POSITIVE_INFINITY,
      t: 0,
      snappedPoint: null,
    };
  }

  const avgLatRad = (((pointLat + startLat + endLat) / 3) * Math.PI) / 180;
  const metersPerLng = 111320 * Math.cos(avgLatRad);
  const metersPerLat = 110540;

  const px = pointLng * metersPerLng;
  const py = pointLat * metersPerLat;
  const sx = startLng * metersPerLng;
  const sy = startLat * metersPerLat;
  const ex = endLng * metersPerLng;
  const ey = endLat * metersPerLat;

  const dx = ex - sx;
  const dy = ey - sy;
  if (dx === 0 && dy === 0) {
    return {
      distanceMeters: Math.hypot(px - sx, py - sy),
      t: 0,
      snappedPoint: {
        lat: startLat,
        lng: startLng,
      },
    };
  }

  const t = Math.max(0, Math.min(1, (((px - sx) * dx) + ((py - sy) * dy)) / ((dx * dx) + (dy * dy))));
  const cx = sx + (t * dx);
  const cy = sy + (t * dy);

  return {
    distanceMeters: Math.hypot(px - cx, py - cy),
    t,
    snappedPoint: {
      lat: startLat + ((endLat - startLat) * t),
      lng: startLng + ((endLng - startLng) * t),
    },
  };
};

const findRouteSnapHeading = (routeCoords, userPoint, sensorHeading) => {
  if (!Array.isArray(routeCoords) || routeCoords.length < 2 || !userPoint) {
    return { snapped: false, heading: null, distanceMeters: Number.POSITIVE_INFINITY };
  }

  let closestDistance = Number.POSITIVE_INFINITY;
  let closestBearing = null;

  for (let i = 0; i < routeCoords.length - 1; i += 1) {
    const start = routeCoords[i];
    const end = routeCoords[i + 1];
    if (!Array.isArray(start) || !Array.isArray(end)) continue;

    const projection = projectPointToSegmentMeters(userPoint, start, end);
    if (!Number.isFinite(projection.distanceMeters) || projection.distanceMeters >= closestDistance) continue;

    const forwardBearing = calculateBearing(
      { lat: start[1], lng: start[0] },
      { lat: end[1], lng: end[0] }
    );

    if (!Number.isFinite(forwardBearing)) continue;

    closestDistance = projection.distanceMeters;
    closestBearing = forwardBearing;
  }

  const SNAP_DISTANCE_METERS = 14;
  if (!Number.isFinite(closestBearing) || closestDistance > SNAP_DISTANCE_METERS) {
    return { snapped: false, heading: null, distanceMeters: closestDistance };
  }

  const backwardBearing = normalizeAngle(closestBearing + 180);
  const sensor = Number.isFinite(sensorHeading) ? normalizeAngle(sensorHeading) : closestBearing;
  const forwardDelta = Math.abs(shortestAngleDelta(sensor, closestBearing));
  const backwardDelta = Math.abs(shortestAngleDelta(sensor, backwardBearing));
  const resolvedHeading = forwardDelta <= backwardDelta ? closestBearing : backwardBearing;

  return {
    snapped: true,
    heading: resolvedHeading,
    distanceMeters: closestDistance,
  };
};

const buildLocationId = (entityType, entity) => {
  const rawId = entity?._id || entity?.id || entity?.name || 'unknown';
  return `${String(entityType || 'location')}:${String(rawId).trim()}`;
};

function GuestView() {
  const { mapFeatures, loading: mapLoading, userLocation, locationError } = useMapState();
  
  // eslint-disable-next-line no-unused-vars
  const { user } = useAuth();
  const mapRef = useRef(null);
  const wrapperRef = useRef(null);
  const detailsContentRef = useRef(null);
  const lastIndicatorLogRef = useRef(0);
  const headingErrorLoggedRef = useRef(false);
  const positionAnimationRef = useRef(null);
  const smoothedLocationRef = useRef(null);
  const routeProgressRef = useRef(0);
  const routeSignatureRef = useRef('');
  const lastMovementPointRef = useRef(null);
  const movementHeadingRef = useRef(null);
  const lastLoggedSearchRef = useRef('');
  const searchLogDebounceRef = useRef(null);
  const orientationHeadingRef = useRef(null);
  const gyroHeadingRef = useRef(null);
  const motionStateRef = useRef({
    lastTs: 0,
    isMoving: false,
  });

  const [heading, setHeading] = useState(0);
  const [navigationHeading, setNavigationHeading] = useState(0);
  const [routeSnapActive, setRouteSnapActive] = useState(false);
  const [hasHeadingData, setHasHeadingData] = useState(false);
  const [smoothedUserLocation, setSmoothedUserLocation] = useState(null);
  const [sidebarQuery, setSidebarQuery] = useState('');
  const sidebarInputRef = useRef(null);
  const [systemStatus, setSystemStatus] = useState({ maintenanceMode: false, kioskStatus: 'online' });
  const [statusLoading, setStatusLoading] = useState(true);
  const [buildings, setBuildings] = useState([]);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);

  // Collapsed state for quick nav list section
  const [quickNavCollapsed, setQuickNavCollapsed] = useState(false);
  const [quickNavMode, setQuickNavMode] = useState('Buildings');

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
  const [popularLocations, setPopularLocations] = useState([]);
  const [popularLoading, setPopularLoading] = useState(true);
  
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
  const [remainingNavigationRoute, setRemainingNavigationRoute] = useState(null); // Retracting route geometry
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

  const activeNavigationGeometry = useMemo(() => {
    if (remainingNavigationRoute?.type === 'LineString' && Array.isArray(remainingNavigationRoute?.coordinates)) {
      if (remainingNavigationRoute.coordinates.length >= 2) {
        return remainingNavigationRoute;
      }
    }
    return navigationRoute;
  }, [navigationRoute, remainingNavigationRoute]);

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

  const userIndicatorStyle = useMemo(() => ({
    '--indicator-dot-size': `${USER_INDICATOR_CONFIG.dotSizePx}px`,
    '--indicator-dot-color': USER_INDICATOR_CONFIG.dotColor,
    '--indicator-pulse-size': `${USER_INDICATOR_CONFIG.pulseSizePx}px`,
    '--indicator-pulse-color': USER_INDICATOR_CONFIG.pulseColorRgb,
    '--indicator-pulse-opacity': `${USER_INDICATOR_CONFIG.pulseOpacity}`,
    '--indicator-direction-color': USER_INDICATOR_CONFIG.directionColor,
    '--indicator-direction-size': `${USER_INDICATOR_CONFIG.directionSizePx}px`,
  }), []);

  const NAV_DEBUG = process.env.REACT_APP_NAV_DEBUG === 'true';

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
    let hasReceivedHeading = false;
    let headingUnavailableTimer = null;
    let motionListenerActive = false;

    const handleOrientation = (event) => {
      const webkitCompassHeading = event?.webkitCompassHeading;
      const alpha = event?.alpha;
      const nextHeading = typeof webkitCompassHeading === 'number'
        ? normalizeAngle(webkitCompassHeading)
        : (typeof alpha === 'number' ? normalizeAngle(360 - alpha) : null);

      if (nextHeading === null) return;

      hasReceivedHeading = true;
      orientationHeadingRef.current = nextHeading;

      if (!Number.isFinite(gyroHeadingRef.current)) {
        gyroHeadingRef.current = nextHeading;
      }

      if (isMounted) {
        setHasHeadingData(true);
        setHeading((prev) => smoothHeading(
          prev,
          nextHeading,
          USER_INDICATOR_CONFIG.headingSmoothing
        ));
      }
    };

    const handleMotion = (event) => {
      const now = performance.now();
      const previousTs = Number(motionStateRef.current.lastTs || 0);
      motionStateRef.current.lastTs = now;

      const dt = previousTs > 0 ? (now - previousTs) / 1000 : 0;
      const alphaRate = Number(event?.rotationRate?.alpha);

      if (Number.isFinite(alphaRate) && dt > 0 && dt < 0.3) {
        const baseHeading = Number.isFinite(gyroHeadingRef.current)
          ? gyroHeadingRef.current
          : (Number.isFinite(orientationHeadingRef.current) ? orientationHeadingRef.current : heading);
        if (Number.isFinite(baseHeading)) {
          gyroHeadingRef.current = normalizeAngle(baseHeading - (alphaRate * dt));
          hasReceivedHeading = true;
          if (isMounted) setHasHeadingData(true);
        }
      }

      const a = event?.acceleration || {};
      const ag = event?.accelerationIncludingGravity || {};
      const accelMag = Math.max(
        Math.hypot(Number(a.x) || 0, Number(a.y) || 0, Number(a.z) || 0),
        Math.hypot(Number(ag.x) || 0, Number(ag.y) || 0, Number(ag.z) || 0)
      );

      motionStateRef.current.isMoving = accelMag > 0.5 || Math.abs(alphaRate || 0) > 1.0;
    };

    const setupOrientation = async () => {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation, true);

            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
              const motionPermission = await DeviceMotionEvent.requestPermission();
              if (motionPermission === 'granted') {
                window.addEventListener('devicemotion', handleMotion, true);
                motionListenerActive = true;
              }
            } else {
              window.addEventListener('devicemotion', handleMotion, true);
              motionListenerActive = true;
            }
          }
        } else {
          window.addEventListener('deviceorientation', handleOrientation, true);
          window.addEventListener('devicemotion', handleMotion, true);
          motionListenerActive = true;
        }
      } catch (err) {
        if (isMounted) setHasHeadingData(false);
        console.error('[UserIndicator:error] Device orientation not available', err);
        console.warn('Device orientation not available:', err);
      }
    };

    setupOrientation();

    headingUnavailableTimer = window.setTimeout(() => {
      if (!hasReceivedHeading && isMounted) {
        setHasHeadingData(false);
        console.error('[UserIndicator:error] Heading data unavailable from device sensors');
      }
    }, 5000);

    return () => {
      isMounted = false;
      if (headingUnavailableTimer) window.clearTimeout(headingUnavailableTimer);
      window.removeEventListener('deviceorientation', handleOrientation, true);
      if (motionListenerActive) {
        window.removeEventListener('devicemotion', handleMotion, true);
      }
    };
  }, []);

  useEffect(() => {
    if (!smoothedUserLocation) {
      lastMovementPointRef.current = null;
      movementHeadingRef.current = null;
      return;
    }

    const previous = lastMovementPointRef.current;
    if (previous) {
      const movementDistance = distanceBetweenPointsMeters(previous, smoothedUserLocation);
      if (Number.isFinite(movementDistance) && movementDistance >= 0.8) {
        const movementHeading = calculateBearing(previous, smoothedUserLocation);
        if (Number.isFinite(movementHeading)) {
          movementHeadingRef.current = movementHeading;
        }
      }
    }

    lastMovementPointRef.current = smoothedUserLocation;
  }, [smoothedUserLocation]);

  useEffect(() => {
    const gpsCourseHeading = Number.isFinite(userLocation?.heading)
      ? normalizeAngle(userLocation.heading)
      : null;

    const phoneFacingHeading = Number.isFinite(orientationHeadingRef.current)
      ? normalizeAngle(orientationHeadingRef.current)
      : (Number.isFinite(gyroHeadingRef.current) ? normalizeAngle(gyroHeadingRef.current) : null);

    const fusedSensorHeading = weightedHeadingAverage([
      {
        heading: orientationHeadingRef.current,
        weight: 0.5,
      },
      {
        heading: gyroHeadingRef.current,
        weight: motionStateRef.current?.isMoving ? 0.25 : 0.12,
      },
      {
        heading: gpsCourseHeading,
        weight: 0.2,
      },
      {
        heading: movementHeadingRef.current,
        weight: 0.1,
      },
    ]);

    const sensorHeading = hasHeadingData
      ? (Number.isFinite(fusedSensorHeading) ? fusedSensorHeading : heading)
      : (Number.isFinite(fusedSensorHeading) ? fusedSensorHeading : heading);

    if (!Number.isFinite(sensorHeading)) {
      setRouteSnapActive(false);
      return;
    }

    let resolvedHeading = Number.isFinite(phoneFacingHeading) ? phoneFacingHeading : sensorHeading;
    let snappedToRoute = false;

    if (!Number.isFinite(phoneFacingHeading) && isNavigating && activeNavigationGeometry?.coordinates?.length >= 2 && smoothedUserLocation) {
      const snapped = findRouteSnapHeading(activeNavigationGeometry.coordinates, smoothedUserLocation, sensorHeading);
      if (snapped.snapped && Number.isFinite(snapped.heading)) {
        resolvedHeading = snapped.heading;
        snappedToRoute = true;
      }
    }

    setRouteSnapActive(snappedToRoute);
    setNavigationHeading((prev) => smoothHeading(
      prev,
      resolvedHeading,
      USER_INDICATOR_CONFIG.sensorFusionSmoothing
    ));
  }, [activeNavigationGeometry, hasHeadingData, heading, isNavigating, smoothedUserLocation, userLocation]);

  useEffect(() => {
    if (!isNavigating || !smoothedUserLocation) return;

    setViewState((prev) => ({
      ...prev,
      longitude: smoothedUserLocation.lng,
      latitude: smoothedUserLocation.lat,
      bearing: navigationHeading,
      pitch: 52,
      zoom: Math.max(prev.zoom, 18.2),
    }));
  }, [isNavigating, navigationHeading, smoothedUserLocation]);

  useEffect(() => {
    if (!userLocation) {
      setSmoothedUserLocation(null);
      smoothedLocationRef.current = null;
      if (positionAnimationRef.current) {
        cancelAnimationFrame(positionAnimationRef.current);
        positionAnimationRef.current = null;
      }
      return;
    }

    const target = { lat: userLocation.lat, lng: userLocation.lng };
    const current = smoothedLocationRef.current;

    if (!current) {
      smoothedLocationRef.current = target;
      setSmoothedUserLocation(target);
      return;
    }

    if (positionAnimationRef.current) {
      cancelAnimationFrame(positionAnimationRef.current);
      positionAnimationRef.current = null;
    }

    const duration = USER_INDICATOR_CONFIG.positionSmoothingMs;
    const startTime = performance.now();
    const start = { ...current };

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);

      const next = {
        lat: start.lat + ((target.lat - start.lat) * eased),
        lng: start.lng + ((target.lng - start.lng) * eased),
      };

      smoothedLocationRef.current = next;
      setSmoothedUserLocation(next);

      if (t < 1) {
        positionAnimationRef.current = requestAnimationFrame(animate);
      } else {
        positionAnimationRef.current = null;
      }
    };

    positionAnimationRef.current = requestAnimationFrame(animate);

    return () => {
      if (positionAnimationRef.current) {
        cancelAnimationFrame(positionAnimationRef.current);
        positionAnimationRef.current = null;
      }
    };
  }, [userLocation]);

  useEffect(() => {
    if (!navigationRoute?.coordinates?.length) {
      setRemainingNavigationRoute(null);
      routeProgressRef.current = 0;
      routeSignatureRef.current = '';
      return;
    }

    const routeCoords = navigationRoute.coordinates;
    const start = routeCoords[0];
    const end = routeCoords[routeCoords.length - 1];
    const signature = `${routeCoords.length}:${start?.[0]}:${start?.[1]}:${end?.[0]}:${end?.[1]}`;

    if (routeSignatureRef.current !== signature) {
      routeSignatureRef.current = signature;
      routeProgressRef.current = 0;
    }

    if (!isNavigating || !smoothedUserLocation || routeCoords.length < 2) {
      setRemainingNavigationRoute({
        type: 'LineString',
        coordinates: routeCoords,
      });
      return;
    }

    let bestMatch = {
      distanceMeters: Number.POSITIVE_INFINITY,
      segmentIndex: 0,
      t: 0,
      snappedPoint: {
        lat: routeCoords[0][1],
        lng: routeCoords[0][0],
      },
    };

    for (let i = 0; i < routeCoords.length - 1; i += 1) {
      const startCoord = routeCoords[i];
      const endCoord = routeCoords[i + 1];
      const projection = projectPointToSegmentMeters(smoothedUserLocation, startCoord, endCoord);
      if (!Number.isFinite(projection.distanceMeters)) continue;

      if (projection.distanceMeters < bestMatch.distanceMeters) {
        bestMatch = {
          ...projection,
          segmentIndex: i,
        };
      }
    }

    const matchedProgress = bestMatch.segmentIndex + bestMatch.t;
    const smoothedProgress = Math.max(routeProgressRef.current, matchedProgress);
    routeProgressRef.current = smoothedProgress;

    const progressIndex = Math.min(routeCoords.length - 2, Math.max(0, Math.floor(smoothedProgress)));
    const progressT = Math.max(0, Math.min(1, smoothedProgress - progressIndex));
    const progressStart = routeCoords[progressIndex];
    const progressEnd = routeCoords[progressIndex + 1];
    const snappedLng = progressStart[0] + ((progressEnd[0] - progressStart[0]) * progressT);
    const snappedLat = progressStart[1] + ((progressEnd[1] - progressStart[1]) * progressT);

    const remainingCoords = [
      [snappedLng, snappedLat],
      ...routeCoords.slice(progressIndex + 1),
    ];

    if (remainingCoords.length < 2) {
      const lastCoord = routeCoords[routeCoords.length - 1] || [snappedLng, snappedLat];
      remainingCoords.push(lastCoord);
    }

    setRemainingNavigationRoute({
      type: 'LineString',
      coordinates: remainingCoords,
    });
  }, [isNavigating, navigationRoute, smoothedUserLocation]);

  useEffect(() => {
    if (!userLocation) return;

    const fallbackHeading = Number.isFinite(userLocation?.heading)
      ? normalizeAngle(userLocation.heading)
      : movementHeadingRef.current;

    if (!hasHeadingData && !Number.isFinite(fallbackHeading)) {
      if (!headingErrorLoggedRef.current) {
        console.error('[UserIndicator:error] Heading data unavailable; using default orientation');
        headingErrorLoggedRef.current = true;
      }
    } else {
      headingErrorLoggedRef.current = false;
    }

    const now = Date.now();
    if (now - lastIndicatorLogRef.current < INDICATOR_LOG_INTERVAL_MS) return;
    lastIndicatorLogRef.current = now;

    const referencePoint = smoothedUserLocation || userLocation;
    const payload = {
      latitude: Number(referencePoint.lat),
      longitude: Number(referencePoint.lng),
      heading: Number.isFinite(navigationHeading)
        ? Number(navigationHeading)
        : Number.isFinite(heading)
          ? Number(heading)
          : null,
      navigation_active: Boolean(isNavigating),
      remaining_path: Array.isArray(activeNavigationGeometry?.coordinates)
        ? activeNavigationGeometry.coordinates.map((coord) => [Number(coord[1]), Number(coord[0])])
        : [],
      route_snap_active: Boolean(routeSnapActive),
    };

    console.log('[UserIndicator:update]', payload);
    if (typeof window !== 'undefined') {
      window.__ALAGAD_NAV_STATE__ = payload;
    }
  }, [
    activeNavigationGeometry,
    hasHeadingData,
    heading,
    isNavigating,
    navigationHeading,
    routeSnapActive,
    smoothedUserLocation,
    userLocation,
  ]);

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

  // Helper: request geolocation with fallback (high-accuracy first, then Wi-Fi/cell fallback)
  const requestCurrentPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      let resolved = false;

      // Attempt 1: high-accuracy GPS first (navigation mode)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!resolved) {
            resolved = true;
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
        },
        () => {
          // Attempt 2: network fallback (Wi-Fi / cell tower triangulation)
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
            { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
          );
        },
        { enableHighAccuracy: true, timeout: 16000, maximumAge: 1500 }
      );
    });
  }, []);

  // Start navigation to a building/entity
  const startNavigation = useCallback(async (targetEntity, targetName, fallbackEntity = null) => {
    if (!targetEntity) {
      const message = 'Destination coordinates not available.';
      if (NAV_DEBUG) {
        console.warn('[NAV DEBUG] Missing target entity while starting navigation.');
      }
      setNavigationError(message);
      return;
    }

    const normalizeStr = (value) => (value || '').toString().trim().toLowerCase();
    const sameId = (a, b) => {
      if (!a || !b) return false;
      return String(a) === String(b);
    };

    const findBuildingByRef = (ref) => {
      if (!ref) return null;

      if (typeof ref === 'object') {
        const refId = ref._id || ref.id;
        if (refId) {
          const byId = buildings.find((b) => sameId(b._id, refId));
          if (byId) return byId;
        }

        const refName = normalizeStr(ref.name);
        if (refName) {
          const byName = buildings.find((b) => normalizeStr(b.name) === refName);
          if (byName) return byName;
        }
      }

      const refText = normalizeStr(ref);
      if (!refText) return null;

      return buildings.find((b) => sameId(b._id, ref) || normalizeStr(b.name) === refText) || null;
    };

    const resolveAssignedBuilding = (entity) => {
      const fromBuildingRef = findBuildingByRef(entity?.building);
      if (fromBuildingRef) return { building: fromBuildingRef, source: 'entity.building' };

      const fromRoomBuildingRef = findBuildingByRef(entity?.room?.building);
      if (fromRoomBuildingRef) return { building: fromRoomBuildingRef, source: 'entity.room.building' };

      const dept = normalizeStr(entity?.department);
      if (dept) {
        const fromDepartment = buildings.find((b) => normalizeStr(b.department) === dept);
        if (fromDepartment) return { building: fromDepartment, source: 'entity.department' };
      }

      return { building: null, source: 'none' };
    };

    const resolveFallbackBuilding = (fallback) => {
      if (!fallback) return { building: null, source: 'none' };

      const byRef = findBuildingByRef(fallback);
      if (byRef) return { building: byRef, source: 'fallbackEntity.ref' };

      if (fallback?.geometry && fallback?.name) {
        return { building: fallback, source: 'fallbackEntity.direct' };
      }

      return { building: null, source: 'none' };
    };

    const resolveCoordsFromMapFeatures = (nameCandidates) => {
      if (!mapFeatures?.features?.length) return null;

      const candidates = (nameCandidates || [])
        .map((name) => normalizeStr(name))
        .filter(Boolean);

      if (candidates.length === 0) return null;

      for (const feature of mapFeatures.features) {
        const props = feature?.properties || {};
        const rawNames = [
          props.name,
          props.title,
          props.label,
          props.building,
          props.buildingName,
          props.office,
          props.officeName,
          props.room,
          props.roomName,
        ];
        const featureNames = rawNames.map((n) => normalizeStr(n)).filter(Boolean);
        if (featureNames.length === 0) continue;

        const matched = featureNames.some((fn) => candidates.some((c) => fn === c || fn.includes(c) || c.includes(fn)));
        if (!matched) continue;

        const coordsFromFeature = getCoords({ geometry: feature.geometry });
        if (coordsFromFeature) return coordsFromFeature;
      }

      return null;
    };

    // Determine navigation target:
    // 1. Prefer the selected entity's own pin when available.
    // 2. If no entity pin exists, fall back to assigned building coordinates.
    // 3. Else error.
    let navEntity = null;
    let navName = targetName || (targetEntity && targetEntity.name);
    let coords = null;

    const targetCoords = getCoords(targetEntity);

    if (targetCoords) {
      navEntity = targetEntity;
      coords = targetCoords;
    }

    // Resolve parent building only as fallback
    const assignedBuildingResolution = resolveAssignedBuilding(targetEntity);
    const fallbackBuildingResolution = resolveFallbackBuilding(fallbackEntity);
    const parentBuilding = assignedBuildingResolution.building || fallbackBuildingResolution.building;
    const assignedBy = assignedBuildingResolution.building
      ? assignedBuildingResolution.source
      : fallbackBuildingResolution.source;
    const parentCoords = parentBuilding ? getCoords(parentBuilding) : null;

    if (!coords && parentBuilding && parentCoords) {
      navEntity = parentBuilding;
      navName = parentBuilding.name + (targetEntity.name && parentBuilding.name !== targetEntity.name ? ` (${targetEntity.name})` : '');
      coords = parentCoords;
    }

    if (!coords) {
      const featureCoords = resolveCoordsFromMapFeatures([
        targetEntity?.name,
        targetEntity?.building?.name,
        targetEntity?.room?.building?.name,
        parentBuilding?.name,
        fallbackEntity?.name,
      ]);
      if (featureCoords) {
        coords = featureCoords;
      }
    }

    if (!coords) {
      const debugDetails = [
        `target=${targetEntity?.name || 'unknown'}`,
        `entityPin=${targetCoords ? 'yes' : 'no'}`,
        `assignedBuilding=${parentBuilding?.name || 'none'}`,
        `assignedBy=${assignedBy}`,
        `buildingPin=${parentCoords ? 'yes' : 'no'}`,
        `department=${targetEntity?.department || 'none'}`,
      ].join(' | ');

      const destinationUnavailableMessage = 'Destination not available.';
      if (NAV_DEBUG) {
        console.warn('[NAV DEBUG] Failed to resolve destination coordinates.', {
          targetEntity,
          assignedBuilding: parentBuilding,
          assignedBy,
          hasEntityPin: Boolean(targetCoords),
          hasBuildingPin: Boolean(parentCoords),
        });
        setNavigationError(`${destinationUnavailableMessage} (${debugDetails})`);
      } else {
        setNavigationError(destinationUnavailableMessage);
      }
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

    let result = await computeRoute(
      loc.lng, loc.lat,
      coords.lng, coords.lat
    );

    // Final fallback: if route to entity pin fails, retry using assigned building pin.
    if (!result && parentCoords && (coords.lng !== parentCoords.lng || coords.lat !== parentCoords.lat)) {
      result = await computeRoute(loc.lng, loc.lat, parentCoords.lng, parentCoords.lat);
      if (result) {
        coords = parentCoords;
        navEntity = parentBuilding;
        navName = parentBuilding?.name
          ? parentBuilding.name + (targetEntity.name && parentBuilding.name !== targetEntity.name ? ` (${targetEntity.name})` : '')
          : navName;
      }
    }
    if (result) {
      // Store destination for live re-routing
      navDestRef.current = { lng: coords.lng, lat: coords.lat };
      setNavigationRoute(result.geometry);
      setRemainingNavigationRoute(result.geometry);
      setNavigationSteps(result.steps);
      setNavigationSummary({
        distance: result.distance,
        duration: result.duration,
      });
      setNavigationTarget(navEntity?.name || targetName || targetEntity.name);
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
  }, [userLocation, getCoords, computeRoute, requestCurrentPosition, isMobile, buildings, mapFeatures, NAV_DEBUG]);

  // Ref to hold the current navigation destination coords for live re-routing
  const navDestRef = useRef(null);

  // Stop navigation and clear route
  const stopNavigation = useCallback(() => {
    setNavigationRoute(null);
    setRemainingNavigationRoute(null);
    setNavigationSteps([]);
    setNavigationSummary(null);
    setIsNavigating(false);
    setRouteSnapActive(false);
    setNavigationTarget(null);
    setNavigationDisplayName(null);
    setNavigationError(null);
    setShowInstructions(false);
    navDestRef.current = null;
    routeProgressRef.current = 0;
    routeSignatureRef.current = '';
    // Fly back to default map position
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [BUKSU_CAMPUS.center.lng, BUKSU_CAMPUS.center.lat],
        zoom: BUKSU_CAMPUS.zoom,
        pitch: BUKSU_CAMPUS.pitch,
        bearing: BUKSU_CAMPUS.bearing,
        duration: 1200,
        essential: true,
      });
    }
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
        setRemainingNavigationRoute(result.geometry);
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

  const searchableBuildings = useMemo(() => {
    return buildings
      .filter((building) => building.isActive !== false)
      .filter((building) => matchesSidebarQuery(building.name || building.description))
      .slice(0, 60);
  }, [buildings, matchesSidebarQuery]);

  const strictQuickNavItems = useMemo(() => {
    const activeBuildings = buildings.filter((building) => building.isActive !== false);
    const activeRooms = rooms.filter((room) => room.isActive !== false && (!room.building?._id || activeBuildingIds.has(room.building._id)));
    const activeOffices = offices.filter((office) => office.isActive !== false && (!office.building?._id || activeBuildingIds.has(office.building._id)));

    const buildEntityRows = (entities, entityType, requireLocation = false) => entities
      .map((entity) => ({
        name: entity?.name || `Unnamed ${entityType}`,
        entityType,
        entity,
      }))
      .filter((row) => {
        if (!requireLocation) return true;
        return Boolean(row.entity?.building?.name);
      })
      .filter((row) => {
        return matchesSidebarQuery(row.name) || matchesSidebarQuery(row.entity?.building?.name);
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    if (quickNavMode === 'Buildings') {
      return buildEntityRows(activeBuildings, 'building');
    }

    if (quickNavMode === 'Rooms') {
      return buildEntityRows(activeRooms, 'room', true);
    }

    return buildEntityRows(activeOffices, 'office');
  }, [buildings, rooms, offices, activeBuildingIds, matchesSidebarQuery, quickNavMode]);

  const popularLookup = useMemo(() => {
    const lookup = {};

    buildings
      .filter((building) => building.isActive !== false)
      .forEach((building) => {
        const locationId = buildLocationId('building', building);
        lookup[locationId] = {
          entity: building,
          entityType: 'building',
          fallbackEntity: null,
          displayName: building.name,
          subtitle: 'Building',
        };
      });

    rooms
      .filter((room) => room.isActive !== false)
      .forEach((room) => {
        const locationId = buildLocationId('room', room);
        lookup[locationId] = {
          entity: room,
          entityType: 'room',
          fallbackEntity: room.building || null,
          displayName: room.name,
          subtitle: room.building?.name || 'Room',
        };
      });

    offices
      .filter((office) => office.isActive !== false)
      .forEach((office) => {
        const locationId = buildLocationId('office', office);
        lookup[locationId] = {
          entity: office,
          entityType: 'office',
          fallbackEntity: office.building || null,
          displayName: office.name,
          subtitle: office.building?.name || 'Office',
        };
      });

    return lookup;
  }, [buildings, offices, rooms]);

  const quickNavPopularLocations = useMemo(() => {
    return [...popularLocations]
      .filter((entry) => {
        const match = popularLookup[entry.locationId];
        return Boolean(match?.entity);
      })
      .sort((a, b) => Number(b?.count || 0) - Number(a?.count || 0));
  }, [popularLocations, popularLookup]);

  const fetchPopularLocations = useCallback(async () => {
    try {
      const data = await popularAPI.getPopular();
      setPopularLocations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn('Could not fetch popular locations:', error);
    } finally {
      setPopularLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPopularLocations();
    const intervalId = window.setInterval(fetchPopularLocations, 30000);
    return () => window.clearInterval(intervalId);
  }, [fetchPopularLocations]);

  useEffect(() => {
    const query = sidebarQuery.trim();
    if (!query) return;

    if (searchLogDebounceRef.current) {
      window.clearTimeout(searchLogDebounceRef.current);
    }

    searchLogDebounceRef.current = window.setTimeout(async () => {
      const bestRoom = filteredRooms[0] || null;
      const bestOffice = filteredOffices[0] || null;
      const bestBuilding = searchableBuildings[0] || null;

      const bestMatch = bestRoom
        ? { entity: bestRoom, entityType: 'room' }
        : (bestOffice
          ? { entity: bestOffice, entityType: 'office' }
          : (bestBuilding
            ? { entity: bestBuilding, entityType: 'building' }
            : null));

      if (!bestMatch?.entity) return;

      const locationId = buildLocationId(bestMatch.entityType, bestMatch.entity);
      const dedupeKey = `${query.toLowerCase()}|${locationId}`;
      if (lastLoggedSearchRef.current === dedupeKey) return;
      lastLoggedSearchRef.current = dedupeKey;

      try {
        await popularAPI.logLocation(locationId);
        fetchPopularLocations();
      } catch (error) {
        console.warn('Could not log search interaction:', error);
      }
    }, 650);

    return () => {
      if (searchLogDebounceRef.current) {
        window.clearTimeout(searchLogDebounceRef.current);
      }
    };
  }, [sidebarQuery, filteredRooms, filteredOffices, searchableBuildings, fetchPopularLocations]);

  const logLocationVisit = useCallback((entityType, entity) => {
    if (!entity) return;

    const locationId = buildLocationId(entityType, entity);
    popularAPI.logLocation(locationId)
      .then(() => fetchPopularLocations())
      .catch((error) => {
        console.warn('Could not log location interaction:', error);
      });
  }, [fetchPopularLocations]);

  const handleSidebarNavigate = useCallback((entity, entityType, fallbackEntity) => {
    if (!entity) {
      return;
    }

    const coords = getCoords(entity) || getCoords(fallbackEntity);
    const entityId = entity._id || entity.id || entity.name;

    // Track selected item
    setSelectedItemId(entityId);
    setSelectedItemType(entityType);

    logLocationVisit(entityType, entity);
    
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
      const fallbackBuildingId = fallbackEntity?._id || fallbackEntity?.id;
      const fallbackBuildingName = fallbackEntity?.name;
      const resolvedFallbackBuilding = buildings.find((b) => (
        (fallbackBuildingId && String(b._id) === String(fallbackBuildingId)) ||
        (fallbackBuildingName && b.name === fallbackBuildingName)
      )) || fallbackEntity;

      const enrichedBuilding = {
        ...resolvedFallbackBuilding,
        rooms: rooms.filter(r => r.building?._id === resolvedFallbackBuilding._id),
        offices: offices.filter(o => o.building?._id === resolvedFallbackBuilding._id),
      };
      setQuickNavBuilding(enrichedBuilding);
      setIsQuickNavOpen(true);
      if (isMobile) {
        setSheetSnap('full');
        setTimeout(() => { detailsContentRef.current?.scrollTo({ top: 0 }); }, 50);
      }
    } else if (entityType === 'office') {
      const enrichedOfficeDetail = {
        ...entity,
        name: entity.name || 'Office',
        numberOfFloors: Number(entity.floor) || 1,
        rooms: [],
        offices: [entity],
      };
      setSelectedFloor(Number(entity.floor) || 1);
      setQuickNavBuilding(enrichedOfficeDetail);
      setIsQuickNavOpen(true);
      if (isMobile) {
        setSheetSnap('full');
        setTimeout(() => { detailsContentRef.current?.scrollTo({ top: 0 }); }, 50);
      }
    } else if (entityType === 'room' && fallbackEntity) {
      const fallbackBuildingId = fallbackEntity?._id || fallbackEntity?.id;
      const fallbackBuildingName = fallbackEntity?.name;
      const resolvedFallbackBuilding = buildings.find((b) => (
        (fallbackBuildingId && String(b._id) === String(fallbackBuildingId)) ||
        (fallbackBuildingName && b.name === fallbackBuildingName)
      )) || fallbackEntity;

      const enrichedBuilding = {
        ...resolvedFallbackBuilding,
        rooms: rooms.filter(r => r.building?._id === resolvedFallbackBuilding._id),
        offices: offices.filter(o => o.building?._id === resolvedFallbackBuilding._id),
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
        { id: entityId, name: entity.name || 'Unknown', type: entityType, timestamp: Date.now() },
        ...prev.filter((item) => item.id !== entityId),
      ].slice(0, 10);
      try {
        localStorage.setItem('alagad-recent-locations', JSON.stringify(newRecent));
      } catch {
        console.warn('Could not save recent locations');
      }
      return newRecent;
    });
    
    // Fly to location on map if coordinates exist — but skip if already viewing this building
    if (coords && selectedItemId !== entityId) {
      flyToLocation(coords.lat, coords.lng);
    }

    // Note: selecting rooms/offices in the sidebar should not auto-start routing.
    // Routing starts only from explicit Navigate actions.
  }, [flyToLocation, getCoords, rooms, offices, buildings, isMobile, selectedItemId, logLocationVisit]);

  const handlePopularNavigate = useCallback((locationId) => {
    const match = popularLookup[locationId];
    if (!match?.entity) return;
    handleSidebarNavigate(match.entity, match.entityType, match.fallbackEntity);
  }, [handleSidebarNavigate, popularLookup]);

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
                  Navigate
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
                            <div
                              key={office._id || idx}
                              className="bv-card bv-card--office"
                              onClick={() => startNavigation(office, office.name, quickNavBuilding)}
                              title="Navigate to this office"
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  startNavigation(office, office.name, quickNavBuilding);
                                }
                              }}
                            >
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
                            <div
                              key={room._id || idx}
                              className="bv-card bv-card--room"
                              onClick={() => startNavigation(room, room.name, quickNavBuilding)}
                              title="Navigate to this room"
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  startNavigation(room, room.name, quickNavBuilding);
                                }
                              }}
                            >
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
        // Strict filtered Quick Navigation List View
        <>
          <div className="guest-sidebar-search">
            <input
              ref={sidebarInputRef}
              type="text"
              placeholder={`Search ${quickNavMode.toLowerCase()}...`}
              value={sidebarQuery}
              onChange={(e) => setSidebarQuery(e.target.value)}
              onFocus={() => { if (isMobile && sheetSnap === 'peek') setSheetSnap('half'); }}
            />

            {(popularLoading || quickNavPopularLocations.length > 0) && (
              <div className="guest-search-most-visited" aria-label="Most visited shortcuts">
                <div className="guest-search-most-visited-label">Most visited</div>
                {popularLoading && (
                  <div className="guest-search-visit-loading">Loading...</div>
                )}

                {!popularLoading && quickNavPopularLocations.slice(0, 6).map((entry) => {
                  const match = popularLookup[entry.locationId];
                  if (!match?.entity) return null;

                  const displayName = match.displayName || 'Place';
                  const compactLabel = (() => {
                    const normalized = String(displayName || '').trim();
                    if (!normalized) return 'Place';
                    const firstSegment = normalized.split(/[–(]/)[0].trim();
                    const firstWord = firstSegment.split(/\s+/)[0] || firstSegment;
                    return firstWord.length > 10 ? `${firstWord.slice(0, 9)}…` : firstWord;
                  })();

                  const chipIcon = (() => {
                    if (match.entityType === 'room') return 'Rm';
                    if (match.entityType === 'office') return 'Of';
                    return compactLabel.slice(0, 2).toUpperCase();
                  })();

                  return (
                    <button
                      key={entry.locationId}
                      type="button"
                      className="quick-visit-chip"
                      onClick={() => handlePopularNavigate(entry.locationId)}
                      title={displayName}
                    >
                      <span className="quick-visit-chip-icon" aria-hidden="true">{chipIcon}</span>
                      <span className="quick-visit-chip-label">{compactLabel}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="guest-search-divider" aria-hidden="true" />
          </div>

          <div className="quick-nav-mode-switch" role="tablist" aria-label="Quick navigation mode">
            {['Buildings', 'Rooms', 'Offices'].map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={quickNavMode === mode}
                className={`quick-nav-mode-btn ${quickNavMode === mode ? 'active' : ''}`}
                onClick={() => setQuickNavMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          {sidebarQuery && (
            <div className="sidebar-results-info">
              {strictQuickNavItems.length} {quickNavMode.toLowerCase()} found for "{sidebarQuery}"
            </div>
          )}

          <div className="guest-sidebar-content">
          <section className="guest-sidebar-section guest-sidebar-section--quicknav">
            <div className="guest-sidebar-section-header">
              <h3>{quickNavMode}</h3>
              <div className="section-header-right">
                <span>{strictQuickNavItems?.length || 0}</span>
                <button 
                  className="section-collapse-btn"
                  onClick={() => setQuickNavCollapsed(!quickNavCollapsed)}
                  aria-label={quickNavCollapsed ? `Expand ${quickNavMode.toLowerCase()}` : `Collapse ${quickNavMode.toLowerCase()}`}
                >
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 16 16" 
                    fill="none" 
                    style={{ transform: quickNavCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                  >
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            {!quickNavCollapsed && (
            <ul>
              {strictQuickNavItems.map((item) => {
                const isSelected = selectedItemId === (item.entity?._id || item.entity?.id || item.name)
                  && selectedItemType === item.entityType;
                return (
                  <li key={`${item.entityType}-${item.name}`}>
                    <button
                      type="button"
                      className={`sidebar-link ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        const fallbackEntity = item.entityType === 'building' ? null : item.entity.building;
                        handleSidebarNavigate(item.entity, item.entityType, fallbackEntity);
                      }}
                      title={item.name}
                    >
                      <div className="sidebar-link-header">
                        <span className="sidebar-link-title">{item.name}</span>
                      </div>

                      {item.entityType !== 'building' && item.entity?.building?.name && (
                        <div className="sidebar-link-department">{item.entity.building.name}</div>
                      )}

                      {item.entityType === 'office' && !item.entity?.building?.name && (
                        <div className="sidebar-link-department">No building assigned</div>
                      )}

                      {item.entityType === 'room' && item.entity?.floor && (
                        <div className="sidebar-link-department">Floor {item.entity.floor}</div>
                      )}
                    </button>
                  </li>
                );
              })}
              {strictQuickNavItems.length === 0 && (
                <li className="sidebar-empty">No {quickNavMode.toLowerCase()} found.</li>
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

      {/* Navigation Summary Strip */}
      {isNavigating && navigationSummary && (
        <div className="nav-strip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
          <span className="nav-strip-name">{navigationDisplayName || 'Destination'}</span>
          <span className="nav-strip-dot">·</span>
          <span className="nav-strip-stat">{formatDistance(navigationSummary.distance)}</span>
          <span className="nav-strip-dot">·</span>
          <span className="nav-strip-stat">{formatDuration(navigationSummary.duration)}</span>
          <button className="nav-strip-cancel" onClick={stopNavigation} title="Cancel navigation">Cancel</button>
        </div>
      )}
      <main className="guest-main">
        {/* Desktop sidebar */}
        <aside className="guest-sidebar desktop-sidebar open" aria-label="Quick navigation">
          <div className="guest-sidebar-header">
            <div>
              <h2>Navigation</h2>
              <p>Search for Buildings, Rooms and offices</p>
            </div>
          </div>
          {navigationContent}
        </aside>

        <div className="guest-map-area">
          <div ref={wrapperRef} className="map-wrapper">
            <MapView
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

              {/* User location marker — compact live GPS indicator */}
              {mapStyleLoaded && smoothedUserLocation && (
                <Marker
                  longitude={smoothedUserLocation.lng}
                  latitude={smoothedUserLocation.lat}
                  anchor="center"
                >
                  <div
                    className={`user-location-marker ${(hasHeadingData || Number.isFinite(userLocation?.heading) || Number.isFinite(movementHeadingRef.current)) ? 'heading-available' : 'heading-unavailable'} ${routeSnapActive ? 'route-snapped' : ''}`}
                    style={userIndicatorStyle}
                  >
                    <div className="user-location-pulse" />
                    <div
                      className="user-location-direction"
                      style={{ transform: `translate(-50%, -50%) rotate(${navigationHeading}deg)` }}
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
                        <path d="M10 1 L17 18 L10 14 L3 18 Z" />
                      </svg>
                    </div>
                    <div className="user-location-dot" />
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
                  blurMarkers={isNavigating}
                  suppressNavTargetPin={isNavigating}
                  onMarkerClick={(building) => {
                    logLocationVisit('building', building);
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
                        if (isNavigating) return;
                        e.originalEvent.stopPropagation();
                        logLocationVisit('office', office);
                        setSelectedItemId(office._id);
                        setSelectedItemType('office');
                        setPopupOffice(office);
                        flyToLocation(coords.lat, coords.lng, 19);
                      }}
                    >
                      <div className={isNavigating && !isSelected ? 'secondary-nav-marker secondary-nav-marker--blurred' : 'secondary-nav-marker'}>
                        <BoxMarker
                          name={office.name}
                          color={office.markerColor || office.color || '#8b5cf6'}
                          isSelected={isSelected}
                        />
                      </div>
                    </Marker>
                    {popupOffice?._id === office._id && !isNavigating && (
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
                              startNavigation(office, office.name, office.building || null);
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

              {/* Navigation route line — retracting route with directional arrows */}
              {mapStyleLoaded && isNavigating && activeNavigationGeometry && (
                <Source
                  id="navigation-route"
                  type="geojson"
                  data={{
                    type: 'Feature',
                    geometry: activeNavigationGeometry,
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
                      'line-color': '#991B1B',
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
                      'line-color': '#DC2626',
                      'line-width': 6,
                      'line-opacity': 1,
                    }}
                    layout={{
                      'line-join': 'round',
                      'line-cap': 'round',
                    }}
                  />
                  <Layer
                    id="navigation-route-arrows"
                    type="symbol"
                    layout={{
                      'symbol-placement': 'line',
                      'symbol-spacing': 46,
                      'text-field': '▶',
                      'text-size': 14,
                      'text-keep-upright': false,
                    }}
                    paint={{
                      'text-color': '#7F1D1D',
                      'text-halo-color': 'rgba(255,255,255,0.65)',
                      'text-halo-width': 1,
                    }}
                  />
                </Source>
              )}

              {/* Navigation destination pin — Google Maps red pin */}
              {mapStyleLoaded && isNavigating && activeNavigationGeometry && (() => {
                const routeCoords = activeNavigationGeometry.coordinates;
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

            </MapView>

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
        <ChatBot onOpenChange={setChatbotOpen} buildings={buildings} offices={offices} rooms={rooms} onNavigate={startNavigation} />,
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
