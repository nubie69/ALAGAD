import * as turf from '@turf/turf';

export const CAMPUS_BOUNDARY = [
  [125.124492, 8.1545658],
  [125.1235159, 8.1552476],
  [125.1224864, 8.155899],
  [125.1243299, 8.1580756],
  [125.1261435, 8.1564897],
  [125.124492, 8.1545658],
];

export const FOCUS_POLYGON = [CAMPUS_BOUNDARY];

export const CAMPUS_BOUNDS = [[125.1224864, 8.1545658], [125.1261435, 8.1580756]];

export const CAMPUS_BOUNDS_DETAILS = {
  north: 8.1580756,
  south: 8.1545658,
  east: 125.1261435,
  west: 125.1224864,
};

export const CAMPUS_POLYGON = turf.polygon(FOCUS_POLYGON);

const CAMPUS_BOUNDARY_LINE = turf.polygonToLine(CAMPUS_POLYGON);

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
