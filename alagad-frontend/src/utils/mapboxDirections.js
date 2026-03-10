/**
 * Mapbox Directions API utility
 *
 * Fetches walking directions between two points using the Mapbox Directions API.
 * Returns route geometry, distance, duration and turn-by-turn steps in the same
 * shape that GuestView already consumes, so it can be a drop-in replacement for
 * the local A* pathfinder.
 *
 * Docs: https://docs.mapbox.com/api/navigation/directions/
 */

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/walking';

/**
 * Fetch a walking route from the Mapbox Directions API.
 *
 * @param {number} startLng – Origin longitude
 * @param {number} startLat – Origin latitude
 * @param {number} endLng   – Destination longitude
 * @param {number} endLat   – Destination latitude
 * @param {object} [options]
 * @param {string} [options.token]       – Override Mapbox token
 * @param {string} [options.profile]     – Routing profile (default: 'walking')
 * @param {boolean}[options.steps]       – Include turn-by-turn steps (default: true)
 * @param {string} [options.geometries]  – Geometry type (default: 'geojson')
 * @param {string} [options.overview]    – Route overview detail (default: 'full')
 * @param {string} [options.language]    – Language for instructions (default: 'en')
 * @returns {Promise<{ geometry, distance, duration, steps } | { error: string }>}
 */
export async function fetchWalkingDirections(
  startLng,
  startLat,
  endLng,
  endLat,
  options = {},
) {
  console.log('🚀 fetchWalkingDirections called with:', { startLng, startLat, endLng, endLat });

  const token = options.token || MAPBOX_TOKEN;
  console.log('🔑 Mapbox token exists?', !!token);
  console.log('🔑 Token first 10 chars:', token ? token.substring(0, 10) + '...' : 'NONE');
  if (!token) {
    console.error('❌ Mapbox token is not configured!');
    return { error: 'Mapbox token is not configured.' };
  }

  const profile = options.profile || 'walking';
  const baseUrl = `https://api.mapbox.com/directions/v5/mapbox/${profile}`;

  // Build coordinates string: origin;destination
  const coordinates = `${startLng},${startLat};${endLng},${endLat}`;
  console.log('🔗 Coordinate string:', coordinates);

  const params = new URLSearchParams({
    access_token: token,
    geometries: options.geometries || 'geojson',
    overview: options.overview || 'full',
    steps: options.steps !== false ? 'true' : 'false',
    language: options.language || 'en',
    // walking-specific: prefer walkways & sidewalks
    walkway_bias: '0.6',
  });

  const url = `${baseUrl}/${coordinates}?${params.toString()}`;
  console.log('🌐 Full Directions URL:', url);

  try {
    console.log('⏳ About to call fetch...');
    const response = await fetch(url);
    console.log('📡 Fetch response received, status:', response.status);

    if (!response.ok) {
      const body = await response.text();
      console.error('❌ Mapbox Directions API error:', response.status, body);
      return { error: `Directions API returned ${response.status}` };
    }

    const responseText = await response.text();
    console.log('📄 Response body (first 200 chars):', responseText.substring(0, 200));

    let data;
    try {
      data = JSON.parse(responseText);
      console.log('✅ Parsed JSON successfully, routes count:', data.routes?.length);
    } catch (jsonError) {
      console.error('❌ Failed to parse JSON:', jsonError);
      return { error: 'Failed to parse directions response.' };
    }

    if (!data.routes || data.routes.length === 0) {
      return { error: 'No route found between the given locations.' };
    }

    const route = data.routes[0]; // best route

    // Extract turn-by-turn steps from all legs
    const steps = [];
    if (route.legs) {
      for (const leg of route.legs) {
        if (leg.steps) {
          for (const step of leg.steps) {
            steps.push({
              maneuver: {
                instruction: step.maneuver?.instruction || '',
                modifier: step.maneuver?.modifier || '',
                type: step.maneuver?.type || '',
                bearing_after: step.maneuver?.bearing_after,
                bearing_before: step.maneuver?.bearing_before,
                location: step.maneuver?.location, // [lng, lat]
              },
              distance: step.distance, // meters
              duration: step.duration, // seconds
              name: step.name || '',
            });
          }
        }
      }
    }

    return {
      geometry: route.geometry, // GeoJSON LineString { type, coordinates }
      distance: route.distance, // total meters
      duration: route.duration, // total seconds
      steps,
      // Include raw route in case callers need extra data
      _raw: route,
    };
  } catch (err) {
    console.error('Mapbox Directions fetch failed:', err);
    return { error: err.message || 'Network error fetching directions.' };
  }
}

/**
 * Fetch directions with waypoints (multi-stop).
 *
 * @param {Array<[number, number]>} waypoints – Array of [lng, lat] pairs (min 2)
 * @param {object} [options] – Same options as fetchWalkingDirections
 */
export async function fetchDirectionsWithWaypoints(waypoints, options = {}) {
  if (!waypoints || waypoints.length < 2) {
    return { error: 'At least 2 waypoints are required.' };
  }

  const token = options.token || MAPBOX_TOKEN;
  if (!token) {
    return { error: 'Mapbox token is not configured.' };
  }

  const profile = options.profile || 'walking';
  const baseUrl = `https://api.mapbox.com/directions/v5/mapbox/${profile}`;
  const coordinates = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');

  const params = new URLSearchParams({
    access_token: token,
    geometries: options.geometries || 'geojson',
    overview: options.overview || 'full',
    steps: options.steps !== false ? 'true' : 'false',
    language: options.language || 'en',
  });

  const url = `${baseUrl}/${coordinates}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      console.error('Mapbox Directions API error:', response.status, body);
      return { error: `Directions API returned ${response.status}` };
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      return { error: 'No route found for the given waypoints.' };
    }

    const route = data.routes[0];

    const steps = [];
    if (route.legs) {
      for (const leg of route.legs) {
        if (leg.steps) {
          for (const step of leg.steps) {
            steps.push({
              maneuver: {
                instruction: step.maneuver?.instruction || '',
                modifier: step.maneuver?.modifier || '',
                type: step.maneuver?.type || '',
                bearing_after: step.maneuver?.bearing_after,
                bearing_before: step.maneuver?.bearing_before,
                location: step.maneuver?.location,
              },
              distance: step.distance,
              duration: step.duration,
              name: step.name || '',
            });
          }
        }
      }
    }

    return {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      steps,
      waypoints: data.waypoints,
      _raw: route,
    };
  } catch (err) {
    console.error('Mapbox Directions fetch failed:', err);
    return { error: err.message || 'Network error fetching directions.' };
  }
}

export default fetchWalkingDirections;
