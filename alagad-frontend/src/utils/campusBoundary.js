import * as turf from '@turf/turf';

export const CAMPUS_BOUNDARY = [
  [125.124584, 8.153767],
  [125.127011, 8.156269],
  [125.124186, 8.158857],
  [125.123881, 8.158488],
  [125.121777, 8.156263],
  [125.124584, 8.153767],
];

export const FOCUS_POLYGON = [CAMPUS_BOUNDARY];

export const CAMPUS_FADE_BOUNDARY = [
  [125.1245463, 8.1544991],
  [125.1248292, 8.1549787],
  [125.1249427, 8.1553603],
  [125.1249285, 8.1557378],
  [125.125263, 8.1560331],
  [125.1248275, 8.1564853],
  [125.1253572, 8.1570909],
  [125.124301, 8.15807],
  [125.1238873, 8.1575713],
  [125.1235098, 8.1571042],
  [125.1230615, 8.1565851],
  [125.1227254, 8.1561933],
  [125.1223415, 8.1559536],
  [125.1232266, 8.1554234],
  [125.1234799, 8.1552571],
  [125.1239059, 8.1549678],
  [125.1242508, 8.154736],
  [125.1245463, 8.1544991],
];

export const CAMPUS_FADE_POLYGON = [CAMPUS_FADE_BOUNDARY];

export const CAMPUS_BOUNDS = [[125.121777, 8.153767], [125.127011, 8.158857]];

export const CAMPUS_BOUNDS_DETAILS = {
  north: 8.158857,
  south: 8.153767,
  east: 125.127011,
  west: 125.121777,
};

export const CAMPUS_POLYGON = turf.polygon(FOCUS_POLYGON);

const CAMPUS_BOUNDARY_LINE = turf.polygonToLine(CAMPUS_POLYGON);
const CAMPUS_CENTER = turf.centroid(CAMPUS_POLYGON).geometry.coordinates;

export const clampLngLatToCampus = (lng, lat) => {
  const longitude = Number(lng);
  const latitude = Number(lat);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return { lng, lat };
  }

  const point = turf.point([longitude, latitude]);

  if (turf.booleanPointInPolygon(point, CAMPUS_POLYGON, { ignoreBoundary: false })) {
    return { lng: longitude, lat: latitude };
  }

  const snapped = turf.nearestPointOnLine(CAMPUS_BOUNDARY_LINE, point);
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
      CAMPUS_POLYGON,
      { ignoreBoundary: false }
    );
  });
};

export const constrainViewportToCampus = (map, nextViewState, previousViewState) => {
  const center = clampLngLatToCampus(nextViewState?.longitude, nextViewState?.latitude);
  const centerWasOutside = center.lng !== nextViewState?.longitude || center.lat !== nextViewState?.latitude;

  if (!centerWasOutside && isMapViewportInsideCampus(map)) {
    return nextViewState;
  }

  return previousViewState || {
    ...nextViewState,
    longitude: center.lng,
    latitude: center.lat,
  };
};

export const easeMapToViewState = (map, viewState, duration = 360) => {
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
    map.jumpTo({ center: CAMPUS_CENTER, zoom: maxZoom });
  }

  return getMapViewState(map);
};
