import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Source, Layer, Marker } from 'react-map-gl';

/**
 * WalkableRoutes
 *
 * Renders walkable campus routes on a react-map-gl <Map>.
 *
 * Features:
 * 1. Loads a GeoJSON FeatureCollection of LineString routes onto the map.
 * 2. Click a route to highlight it (thicker line, different colour).
 * 3. Displays live GPS location as a pulsing blue dot marker.
 * 4. Snaps the GPS marker to the nearest point on the selected route.
 * 5. Dynamically updates when a new route is selected.
 *
 * Props:
 *   routesGeoJSON  – FeatureCollection of LineStrings (required)
 *   userLocation   – { lat, lng } from GPS / MapContext (optional)
 *   selectedRouteId – controlled selected route id (optional)
 *   onRouteSelect  – callback(routeId) when user clicks a route (optional)
 *   mapRef         – ref to the underlying Map instance (required for click interactivity)
 */

// ─── Geometry helpers ────────────────────────────────────────────────────────

/** Haversine distance in metres between two [lng, lat] points */
function haversineDistance([lng1, lat1], [lng2, lat2]) {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Projects point P onto segment AB and returns the closest point on AB.
 * All inputs/outputs are [lng, lat].
 */
function nearestPointOnSegment(P, A, B) {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  if (dx === 0 && dy === 0) return A; // degenerate segment

  let t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return [A[0] + t * dx, A[1] + t * dy];
}

/**
 * Given a user position [lng, lat] and a LineString coordinate array,
 * returns the closest point [lng, lat] on the line.
 */
function snapToLine(userPos, lineCoords) {
  let bestPoint = lineCoords[0];
  let bestDist = Infinity;

  for (let i = 0; i < lineCoords.length - 1; i++) {
    const candidate = nearestPointOnSegment(userPos, lineCoords[i], lineCoords[i + 1]);
    const dist = haversineDistance(userPos, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = candidate;
    }
  }
  return { point: bestPoint, distance: bestDist };
}

// ─── Layer styles ────────────────────────────────────────────────────────────

/** Base (un-selected) route style — subtle grey dashed paths */
const routeLayerStyle = {
  id: 'walkable-routes',
  type: 'line',
  filter: ['==', '$type', 'LineString'],
  paint: {
    'line-color': '#6b7280',
    'line-width': 1.5,
    'line-opacity': 0.5,
    'line-dasharray': [2, 3],
  },
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
};

/** Hit-area layer (invisible, wider) so thin lines are easier to click */
const routeHitLayerStyle = {
  id: 'walkable-routes-hit',
  type: 'line',
  filter: ['==', '$type', 'LineString'],
  paint: {
    'line-color': 'transparent',
    'line-width': 14,
    'line-opacity': 0,
  },
};

/** Highlighted selected route style */
const highlightLayerStyle = {
  id: 'walkable-routes-highlight',
  type: 'line',
  filter: ['==', '$type', 'LineString'],
  paint: {
    'line-color': '#FF5722',
    'line-width': 5,
    'line-opacity': 1,
  },
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
};

// ─── GPS marker styling ─────────────────────────────────────────────────────

const gpsMarkerStyle = {
  width: 18,
  height: 18,
  borderRadius: '50%',
  background: '#1976D2',
  border: '3px solid #fff',
  boxShadow: '0 0 8px rgba(25,118,210,0.6)',
  cursor: 'pointer',
  animation: 'gpsPulse 2s ease-in-out infinite',
};

const gpsMarkerKeyframes = `
@keyframes gpsPulse {
  0%   { box-shadow: 0 0 4px rgba(25,118,210,0.4); }
  50%  { box-shadow: 0 0 14px rgba(25,118,210,0.8); }
  100% { box-shadow: 0 0 4px rgba(25,118,210,0.4); }
}
`;

// ─── Component ───────────────────────────────────────────────────────────────

export default function WalkableRoutes({
  routesGeoJSON,
  userLocation = null,       // { lat, lng }
  selectedRouteId = null,
  onRouteSelect = () => {},
  mapRef,
}) {
  // Internal selected state (if parent doesn't control it)
  const [internalSelectedId, setInternalSelectedId] = useState(null);
  const activeRouteId = selectedRouteId ?? internalSelectedId;

  // Inject keyframes once
  const styleInjected = useRef(false);
  useEffect(() => {
    if (!styleInjected.current) {
      const style = document.createElement('style');
      style.textContent = gpsMarkerKeyframes;
      document.head.appendChild(style);
      styleInjected.current = true;
    }
  }, []);

  // ── Click handler: attach to map once ──────────────────────────────────

  const handleRouteClick = useCallback(
    (e) => {
      // Query rendered features under click from our hit layer + visible layer
      const map = mapRef?.current?.getMap?.() ?? mapRef?.current;
      if (!map) return;

      const features = map.queryRenderedFeatures(e.point, {
        layers: ['walkable-routes', 'walkable-routes-hit'],
      });

      if (features.length > 0) {
        const clickedId = features[0].properties?.id ?? null;
        if (clickedId) {
          setInternalSelectedId(clickedId);
          onRouteSelect(clickedId);
        }
      }
    },
    [mapRef, onRouteSelect],
  );

  useEffect(() => {
    const map = mapRef?.current?.getMap?.() ?? mapRef?.current;
    if (!map) return;

    map.on('click', handleRouteClick);

    // Cursor affordance
    const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const onLeave = () => { map.getCanvas().style.cursor = ''; };

    map.on('mouseenter', 'walkable-routes-hit', onEnter);
    map.on('mouseleave', 'walkable-routes-hit', onLeave);

    return () => {
      map.off('click', handleRouteClick);
      map.off('mouseenter', 'walkable-routes-hit', onEnter);
      map.off('mouseleave', 'walkable-routes-hit', onLeave);
    };
  }, [mapRef, handleRouteClick]);

  // ── Derived data ───────────────────────────────────────────────────────

  /** GeoJSON with only the selected route */
  const highlightGeoJSON = useMemo(() => {
    if (!activeRouteId || !routesGeoJSON) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: routesGeoJSON.features.filter(
        (f) => f.properties?.id === activeRouteId && f.geometry?.type === 'LineString',
      ),
    };
  }, [activeRouteId, routesGeoJSON]);

  /** Only LineString features for routing layers */
  const lineOnlyGeoJSON = useMemo(() => {
    if (!routesGeoJSON) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: routesGeoJSON.features.filter(
        (f) => f.geometry?.type === 'LineString',
      ),
    };
  }, [routesGeoJSON]);

  // ── GPS snapping ───────────────────────────────────────────────────────

  const snappedPosition = useMemo(() => {
    if (!userLocation) return null;
    const userPos = [userLocation.lng, userLocation.lat];

    // If a route is selected, snap to it
    if (activeRouteId && highlightGeoJSON.features.length > 0) {
      const coords = highlightGeoJSON.features[0].geometry.coordinates;
      const { point, distance } = snapToLine(userPos, coords);
      // Only snap if within 50 m of the route
      if (distance < 50) {
        return { lng: point[0], lat: point[1] };
      }
    }

    // No selected route or too far – snap to nearest route overall
    if (lineOnlyGeoJSON.features.length > 0) {
      let best = null;
      let bestDist = Infinity;
      for (const feature of lineOnlyGeoJSON.features) {
        const { point, distance } = snapToLine(userPos, feature.geometry.coordinates);
        if (distance < bestDist) {
          bestDist = distance;
          best = point;
        }
      }
      if (best && bestDist < 50) {
        return { lng: best[0], lat: best[1] };
      }
    }

    // Fallback: show raw GPS position
    return userLocation;
  }, [userLocation, activeRouteId, highlightGeoJSON, lineOnlyGeoJSON]);

  // ── Render ─────────────────────────────────────────────────────────────

  if (!routesGeoJSON) return null;

  return (
    <>
      {/* All routes (base) */}
      <Source id="walkable-routes-src" type="geojson" data={lineOnlyGeoJSON}>
        <Layer {...routeLayerStyle} />
        <Layer {...routeHitLayerStyle} />
      </Source>

      {/* Highlighted route */}
      <Source id="walkable-routes-highlight-src" type="geojson" data={highlightGeoJSON}>
        <Layer {...highlightLayerStyle} />
      </Source>

      {/* GPS marker (snapped or raw) */}
      {snappedPosition && (
        <Marker
          longitude={snappedPosition.lng}
          latitude={snappedPosition.lat}
          anchor="center"
        >
          <div
            style={gpsMarkerStyle}
            title="Your location"
            aria-label="Your live GPS location"
          />
        </Marker>
      )}
    </>
  );
}
