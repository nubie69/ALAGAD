import * as turf from '@turf/turf';
import buffer from '@turf/buffer';
import { polygon } from '@turf/helpers';

export const CAMPUS_BOUNDARY = [
  [125.1244987, 8.1545629],
  [125.1248841, 8.1551231],
  [125.1249252, 8.1557304],
  [125.1252583, 8.1560442],
  [125.1248151, 8.1565015],
  [125.1253372, 8.1570925],
  [125.1243346, 8.1580276],
  [125.1225816, 8.1559596],
  [125.1234875, 8.1553044],
  [125.1244987, 8.1545629],
];

export const FOCUS_POLYGON = [CAMPUS_BOUNDARY];
export const CAMPUS_FADE_BOUNDARY = CAMPUS_BOUNDARY;
export const CAMPUS_FADE_POLYGON = [CAMPUS_FADE_BOUNDARY];

export const MAP_VIEW_BOUNDARY = [
  [125.1243542, 8.1529408],
  [125.127525, 8.156498],
  [125.1234382, 8.1600245],
  [125.1203284, 8.1563826],
  [125.1243542, 8.1529408],
];

const WORLD_MASK_RING = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]];
const CAMPUS_FADE_DISTANCE_METERS = 48;
const CAMPUS_FADE_BAND_COUNT = 160;
const CAMPUS_FADE_EDGE_OPACITY = 0.08;
const CAMPUS_OUTSIDE_OPACITY = 1;
const CAMPUS_FADE_BUFFER_METERS = Array.from(
  { length: CAMPUS_FADE_BAND_COUNT },
  (_, index) => ((index + 1) / CAMPUS_FADE_BAND_COUNT) * CAMPUS_FADE_DISTANCE_METERS
);

const getPrimaryPolygonRing = (feature) => {
  const geometry = feature?.geometry;
  if (geometry?.type === 'Polygon') return geometry.coordinates?.[0] || null;
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates?.[0]?.[0] || null;
  return null;
};

export const createCampusFadeMasks = () => {
  const campusFeature = polygon(CAMPUS_FADE_POLYGON);
  const buffers = CAMPUS_FADE_BUFFER_METERS
    .map((meters) => buffer(campusFeature, meters, { units: 'meters', steps: 24 }))
    .map(getPrimaryPolygonRing)
    .filter(Boolean);

  const transitionFeatures = buffers.map((outerRing, index) => {
    const innerRing = index === 0 ? CAMPUS_FADE_POLYGON[0] : buffers[index - 1];
    const progress = (index + 1) / buffers.length;

    return {
      type: 'Feature',
      properties: {
        band: index + 1,
        fadeOpacity: Number((
          CAMPUS_FADE_EDGE_OPACITY
          + (progress * (CAMPUS_OUTSIDE_OPACITY - CAMPUS_FADE_EDGE_OPACITY))
        ).toFixed(4)),
      },
      geometry: {
        type: 'Polygon',
        coordinates: [outerRing, innerRing],
      },
    };
  });

  const farOutsideRing = buffers[buffers.length - 1] || CAMPUS_FADE_POLYGON[0];

  return {
    transition: {
      type: 'FeatureCollection',
      features: transitionFeatures,
    },
    outside: {
      type: 'Feature',
      properties: {
        fadeOpacity: CAMPUS_OUTSIDE_OPACITY,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [WORLD_MASK_RING, farOutsideRing],
      },
    },
    boundary: campusFeature,
  };
};

export const CAMPUS_FADE_MASKS = createCampusFadeMasks();

export const CAMPUS_BOUNDS = [[125.1203284, 8.1529408], [125.127525, 8.1600245]];

export const CAMPUS_BOUNDS_DETAILS = {
  north: 8.1600245,
  south: 8.1529408,
  east: 125.127525,
  west: 125.1203284,
};

export const CAMPUS_POLYGON = turf.polygon(FOCUS_POLYGON);
export const MAP_VIEW_POLYGON = turf.polygon([MAP_VIEW_BOUNDARY]);

const MAP_VIEW_BOUNDARY_LINE = turf.polygonToLine(MAP_VIEW_POLYGON);
const MAP_VIEW_CENTER = turf.centroid(MAP_VIEW_POLYGON).geometry.coordinates;

export const clampLngLatToCampus = (lng, lat) => {
  const longitude = Number(lng);
  const latitude = Number(lat);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return { lng, lat };
  }

  const point = turf.point([longitude, latitude]);

  if (turf.booleanPointInPolygon(point, MAP_VIEW_POLYGON, { ignoreBoundary: false })) {
    return { lng: longitude, lat: latitude };
  }

  const snapped = turf.nearestPointOnLine(MAP_VIEW_BOUNDARY_LINE, point);
  const [clampedLng, clampedLat] = snapped.geometry.coordinates;
  return { lng: clampedLng, lat: clampedLat };
};

export const clampViewStateToCampus = (viewState) => {
  const clamped = clampLngLatToCampus(viewState?.longitude, viewState?.latitude);

  if (clamped.lng === viewState?.longitude && clamped.lat === viewState?.latitude) {
    return viewState;
  }

  return {
    ...viewState,
    longitude: clamped.lng,
    latitude: clamped.lat,
  };
};

export const isMapViewportInsideCampus = (map) => {
  const canvas = map?.getCanvas?.();
  const width = canvas?.clientWidth || canvas?.width || 0;
  const height = canvas?.clientHeight || canvas?.height || 0;

  if (!width || !height || typeof map?.unproject !== 'function') return true;

  return [[0, 0], [width, 0], [width, height], [0, height]].every(([x, y]) => {
    const corner = map.unproject([x, y]);
    return turf.booleanPointInPolygon(
      turf.point([corner.lng, corner.lat]),
      MAP_VIEW_POLYGON,
      { ignoreBoundary: false }
    );
  });
};

export const constrainViewportToCampus = (map, nextViewState) => {
  const center = clampLngLatToCampus(nextViewState?.longitude, nextViewState?.latitude);
  const centerWasOutside = center.lng !== nextViewState?.longitude || center.lat !== nextViewState?.latitude;

  if (!centerWasOutside) return nextViewState;

  return {
    ...nextViewState,
    longitude: center.lng,
    latitude: center.lat,
  };
};

export const easeMapToViewState = (map, viewState, duration = 480) => {
  if (!map || !viewState) return false;

  map.easeTo({
    center: [viewState.longitude, viewState.latitude],
    zoom: viewState.zoom,
    bearing: viewState.bearing,
    pitch: viewState.pitch,
    duration,
    easing: progress => 1 - Math.pow(1 - progress, 3),
    essential: true,
  });

  return true;
};

const getMapViewState = (map) => {
  const center = map.getCenter();
  return {
    longitude: center.lng,
    latitude: center.lat,
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
};

export const fitViewportInsideCampus = (map, maxZoom = 20) => {
  if (!map) return null;

  const currentCenter = map.getCenter();
  const clampedCenter = clampLngLatToCampus(currentCenter.lng, currentCenter.lat);
  map.jumpTo({ center: [clampedCenter.lng, clampedCenter.lat] });

  while (!isMapViewportInsideCampus(map) && map.getZoom() < maxZoom) {
    map.jumpTo({ zoom: Math.min(maxZoom, map.getZoom() + 0.25) });
  }

  if (!isMapViewportInsideCampus(map)) {
    map.jumpTo({ center: MAP_VIEW_CENTER, zoom: maxZoom });
  }

  return getMapViewState(map);
};
