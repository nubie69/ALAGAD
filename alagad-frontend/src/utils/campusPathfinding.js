/**
 * Campus Pathfinding via Walkable Paths
 *
 * Uses Turf.js for all geographic calculations and a custom A* algorithm
 * for shortest-path routing on a walkable-paths graph built from GeoJSON.
 *
 * Pipeline:
 *  1. Load walkableRoutes.json and build an adjacency-list graph.
 *  2. Snap nearby vertices (< 1 m) so segments share intersection nodes.
 *  3. Compute Turf.js distance (metres) for each edge weight.
 *  4. Snap any user GPS / building coordinate to the nearest graph node.
 *  5. Run A* search with Turf.js straight-line distance as heuristic.
 *  6. Return GeoJSON LineString result with distance, duration & directions.
 *
 *  NO Mapbox Directions API is used — routes strictly follow graph edges.
 */
import * as turf from '@turf/turf';
import walkableRoutesData from '../data/walkableRoutes.json';

// ── Campus boundary (closed ring – matches GuestView FOCUS_POLYGON) ──────────
const CAMPUS_BOUNDARY = [
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
];

const campusPolygon = turf.polygon([CAMPUS_BOUNDARY]);

// ── Constants ────────────────────────────────────────────────────────────────
const WALKING_SPEED = 1.2; // average walking speed in m/s
const SNAP_THRESHOLD_M = 5; // metres – connect vertices near other segments

// ═══════════════════════════════════════════════════════════════════════════════
//  Graph built dynamically from walkableRoutes.json GeoJSON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Internal weighted graph structures (lazy singleton).
 *   _graph: Map<key, Array<{ key, coord, weight }>>
 *   _coords: Map<key, [lng, lat]>
 */
let _graph = null;
let _coords = null;
let _walkableGeoJSON = null;

/** Make a deterministic string key from a coordinate. */
function coordKey(c) {
  return `${c[0].toFixed(7)},${c[1].toFixed(7)}`;
}

/**
 * Build the walkable-path graph from the GeoJSON data.
 *
 * Strategy:
 *  1. For each LineString, add edges between consecutive vertices.
 *  2. For every vertex V in line L, find the nearest point on every OTHER
 *     line segment.  If that nearest point is within SNAP_THRESHOLD_M,
 *     split the segment and add a connecting edge — this is how paths that
 *     cross or meet mid-segment get linked.
 *  3. Merge any vertices that end up within 0.5 m of each other (union-find).
 */
function buildGraph() {
  if (_graph) return;

  const lines = (walkableRoutesData.features || []).filter(
    (f) => f.geometry && f.geometry.type === 'LineString',
  );

  // ── Helpers ───────────────────────────────────────────────────────────
  _graph = new Map();
  _coords = new Map();

  function ensureNode(coord) {
    const k = coordKey(coord);
    if (!_graph.has(k)) {
      _graph.set(k, []);
      _coords.set(k, [coord[0], coord[1]]);
    }
    return k;
  }

  function addEdgeBetween(coordA, coordB) {
    const kA = ensureNode(coordA);
    const kB = ensureNode(coordB);
    if (kA === kB) return;
    const cA = _coords.get(kA);
    const cB = _coords.get(kB);
    const w = turf.distance(turf.point(cA), turf.point(cB), { units: 'meters' });
    if (!_graph.get(kA).some((e) => e.key === kB)) {
      _graph.get(kA).push({ key: kB, coord: cB, weight: w });
    }
    if (!_graph.get(kB).some((e) => e.key === kA)) {
      _graph.get(kB).push({ key: kA, coord: cA, weight: w });
    }
  }

  // ── Step 1: Add edges from each LineString ────────────────────────────
  const lineCoords = lines.map((l) => l.geometry.coordinates.map((c) => [c[0], c[1]]));

  for (const coords of lineCoords) {
    for (let i = 0; i < coords.length - 1; i++) {
      addEdgeBetween(coords[i], coords[i + 1]);
    }
  }

  // ── Step 2: Cross-line proximity connections ──────────────────────────
  // For every vertex, check distance to every segment in OTHER lines.
  // If close enough, inject a connection (splitting the segment into the graph).
  for (let li = 0; li < lineCoords.length; li++) {
    for (const vert of lineCoords[li]) {
      const pt = turf.point(vert);
      for (let lj = 0; lj < lineCoords.length; lj++) {
        if (li === lj) continue;
        const other = lineCoords[lj];
        for (let s = 0; s < other.length - 1; s++) {
          const seg = turf.lineString([other[s], other[s + 1]]);
          const nearest = turf.nearestPointOnLine(seg, pt);
          const distM = nearest.properties.dist * 1000; // km → m
          if (distM < SNAP_THRESHOLD_M) {
            // Connect this vertex to both endpoints of the segment
            // (the nearest point is essentially on this segment, so we
            //  add direct edges to the vertices that bound it)
            addEdgeBetween(vert, other[s]);
            addEdgeBetween(vert, other[s + 1]);
          }
        }
      }
    }
  }

  // ── Step 3: Merge very-close nodes (< 0.5 m) via union-find ──────────
  const allKeys = [..._graph.keys()];
  const parent = new Map();
  for (const k of allKeys) parent.set(k, k);
  function find(x) {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
    return x;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  for (let i = 0; i < allKeys.length; i++) {
    const ci = _coords.get(allKeys[i]);
    for (let j = i + 1; j < allKeys.length; j++) {
      const cj = _coords.get(allKeys[j]);
      const d = turf.distance(turf.point(ci), turf.point(cj), { units: 'meters' });
      if (d < 0.5) union(allKeys[i], allKeys[j]);
    }
  }

  // Rebuild the graph with merged nodes
  const mergedGraph = new Map();
  const mergedCoords = new Map();

  for (const k of allKeys) {
    const root = find(k);
    if (!mergedGraph.has(root)) {
      mergedGraph.set(root, []);
      mergedCoords.set(root, _coords.get(root));
    }
  }

  for (const [key, neighbours] of _graph) {
    const rKey = find(key);
    for (const nb of neighbours) {
      const rNb = find(nb.key);
      if (rKey === rNb) continue;
      const list = mergedGraph.get(rKey);
      if (!list.some((e) => e.key === rNb)) {
        const cNb = mergedCoords.get(rNb);
        const cKey = mergedCoords.get(rKey);
        const w = turf.distance(turf.point(cKey), turf.point(cNb), { units: 'meters' });
        list.push({ key: rNb, coord: cNb, weight: w });
      }
      const listNb = mergedGraph.get(rNb);
      if (!listNb.some((e) => e.key === rKey)) {
        const cKey = mergedCoords.get(rKey);
        const cNb = mergedCoords.get(rNb);
        const w = turf.distance(turf.point(cNb), turf.point(cKey), { units: 'meters' });
        listNb.push({ key: rKey, coord: cKey, weight: w });
      }
    }
  }

  _graph = mergedGraph;
  _coords = mergedCoords;

  // ── Step 4: Build display GeoJSON from graph edges ────────────────────
  const edgeSet = new Set();
  const features = [];
  for (const [key, neighbours] of _graph) {
    const coord = _coords.get(key);
    for (const nb of neighbours) {
      const edgeId = [key, nb.key].sort().join('|');
      if (edgeSet.has(edgeId)) continue;
      edgeSet.add(edgeId);
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [coord, nb.coord] },
      });
    }
  }
  _walkableGeoJSON = { type: 'FeatureCollection', features };

  console.log(`[Pathfinder] Graph built: ${_graph.size} nodes, ${edgeSet.size} edges`);
}

/** Get the walkable paths as a GeoJSON FeatureCollection for map display. */
function getWalkableGeoJSON() {
  if (!_walkableGeoJSON) buildGraph();
  return _walkableGeoJSON;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STEP 2b – A* shortest-path search
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Min-heap (binary) for the A* open set – avoids O(n) scans.
 */
class MinHeap {
  constructor() { this._data = []; }
  get size() { return this._data.length; }

  push(item) {
    this._data.push(item);
    this._bubbleUp(this._data.length - 1);
  }

  pop() {
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._data[i].f >= this._data[parent].f) break;
      [this._data[i], this._data[parent]] = [this._data[parent], this._data[i]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this._data[l].f < this._data[smallest].f) smallest = l;
      if (r < n && this._data[r].f < this._data[smallest].f) smallest = r;
      if (smallest === i) break;
      [this._data[i], this._data[smallest]] = [this._data[smallest], this._data[i]];
      i = smallest;
    }
  }
}

/**
 * A* search on the walkable-paths graph.
 *
 * @param {string} startKey – coordKey of the start node
 * @param {string} endKey   – coordKey of the goal node
 * @returns {Array<[lng,lat]>|null} ordered path coordinates, or null
 */
function astarSearch(startKey, endKey) {
  buildGraph();

  if (!_graph.has(startKey) || !_graph.has(endKey)) return null;
  if (startKey === endKey) return [_coords.get(startKey)];

  const goalCoord = _coords.get(endKey);

  /** Heuristic: Turf.js straight-line distance (metres) – admissible. */
  function h(key) {
    return turf.distance(turf.point(_coords.get(key)), turf.point(goalCoord), { units: 'meters' });
  }

  const gScore = new Map(); // best known cost from start
  const cameFrom = new Map();
  const closed = new Set();

  gScore.set(startKey, 0);

  const open = new MinHeap();
  open.push({ key: startKey, f: h(startKey) });

  while (open.size > 0) {
    const current = open.pop();
    if (current.key === endKey) {
      // Reconstruct path
      const path = [];
      let k = endKey;
      while (k) {
        path.push(_coords.get(k));
        k = cameFrom.get(k);
      }
      path.reverse();
      return path;
    }

    if (closed.has(current.key)) continue;
    closed.add(current.key);

    const neighbours = _graph.get(current.key) || [];
    const currentG = gScore.get(current.key);

    for (const nb of neighbours) {
      if (closed.has(nb.key)) continue;
      const tentG = currentG + nb.weight;
      if (tentG < (gScore.get(nb.key) ?? Infinity)) {
        gScore.set(nb.key, tentG);
        cameFrom.set(nb.key, current.key);
        open.push({ key: nb.key, f: tentG + h(nb.key) });
      }
    }
  }

  return null; // no path found
}

/**
 * Find the nearest *graph node* to a given coordinate.
 * Returns { key, coord, distanceM }.
 */
function nearestGraphNode(lngLat) {
  buildGraph();
  const pt = turf.point(lngLat);
  let bestKey = null;
  let bestDist = Infinity;

  for (const [key, coord] of _coords) {
    const d = turf.distance(pt, turf.point(coord), { units: 'meters' });
    if (d < bestDist) {
      bestDist = d;
      bestKey = key;
    }
  }
  return { key: bestKey, coord: bestKey ? _coords.get(bestKey) : null, distanceM: bestDist };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STEP 3 – Snap any point to the nearest position on the walkable network
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Given [lng, lat], return the nearest point on the walkable network as a
 * Turf point feature plus the distance in metres.
 */
function snapToNetwork(lngLat) {
  const network = getWalkableGeoJSON();
  const pt = turf.point(lngLat);

  let bestPoint = null;
  let bestDist = Infinity;
  let bestEdge = null;

  for (const feature of network.features) {
    const coords = feature.geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const seg = turf.lineString([coords[i], coords[i + 1]]);
      const nearest = turf.nearestPointOnLine(seg, pt);
      const d = nearest.properties.dist; // km
      if (d < bestDist) {
        bestDist = d;
        bestPoint = nearest;
        bestEdge = { feature, segIdx: i };
      }
    }
  }

  return {
    point: bestPoint,
    distanceM: bestDist * 1000,
    edge: bestEdge,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STEP 4 – Generate turn-by-turn directions
// ═══════════════════════════════════════════════════════════════════════════════

function generateDirections(coords) {
  if (coords.length < 2) {
    return { steps: [], totalDistance: 0, totalDuration: 0 };
  }

  const line = turf.lineString(coords);
  const totalDistance = turf.length(line, { units: 'meters' });
  const totalDuration = totalDistance / WALKING_SPEED;

  // Pre-compute segment distances and bearings
  const segments = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const from = turf.point(coords[i]);
    const to   = turf.point(coords[i + 1]);
    segments.push({
      distance: turf.distance(from, to, { units: 'meters' }),
      bearing:  turf.bearing(from, to),
    });
  }

  // Merge segments into meaningful steps at turn points
  const rawSteps = [];
  let accumDist = segments[0]?.distance || 0;
  let currentBearing = segments[0]?.bearing || 0;

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    let turnAngle = seg.bearing - currentBearing;
    while (turnAngle > 180) turnAngle -= 360;
    while (turnAngle < -180) turnAngle += 360;

    if (Math.abs(turnAngle) < 20) {
      accumDist += seg.distance;
    } else {
      rawSteps.push({
        instruction: rawSteps.length === 0 ? 'Head towards your destination' : 'Continue straight',
        modifier: 'straight',
        distance: accumDist,
      });

      let instruction, modifier;
      if (turnAngle > 0 && turnAngle <= 50) {
        instruction = 'Bear slightly right';
        modifier = 'slight right';
      } else if (turnAngle > 50 && turnAngle <= 130) {
        instruction = 'Turn right';
        modifier = 'right';
      } else if (turnAngle > 130) {
        instruction = 'Make a sharp right';
        modifier = 'sharp right';
      } else if (turnAngle < 0 && turnAngle >= -50) {
        instruction = 'Bear slightly left';
        modifier = 'slight left';
      } else if (turnAngle < -50 && turnAngle >= -130) {
        instruction = 'Turn left';
        modifier = 'left';
      } else {
        instruction = 'Make a sharp left';
        modifier = 'sharp left';
      }

      rawSteps.push({ instruction, modifier, distance: seg.distance });
      accumDist = seg.distance;
      currentBearing = seg.bearing;
    }
  }

  if (accumDist > 0) {
    rawSteps.push({
      instruction: rawSteps.length === 0 ? 'Head towards your destination' : 'Continue straight',
      modifier: 'straight',
      distance: accumDist,
    });
  }

  // Merge consecutive straights
  const mergedSteps = [];
  for (const step of rawSteps) {
    const prev = mergedSteps[mergedSteps.length - 1];
    if (prev && step.modifier === 'straight' && prev.modifier === 'straight') {
      prev.distance += step.distance;
    } else {
      mergedSteps.push({ ...step });
    }
  }

  const steps = mergedSteps.map((s) => ({
    maneuver: {
      instruction: `${s.instruction} for ${Math.round(s.distance)}m`,
      modifier: s.modifier,
    },
    distance: s.distance,
  }));

  return { steps, totalDistance, totalDuration };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STEP 5 – Verify route stays inside campus boundary
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ensure every coordinate of the route is inside the campus polygon.
 * If a point lies outside, clamp it to the nearest point on the boundary.
 */
function clampRouteToCampus(coords) {
  return coords.map((c) => {
    if (turf.booleanPointInPolygon(turf.point(c), campusPolygon)) return c;
    const line = turf.polygonToLine(campusPolygon);
    const snapped = turf.nearestPointOnLine(line, turf.point(c));
    return snapped.geometry.coordinates;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find the shortest walking route constrained to campus walkable paths.
 *
 * @param {number} startLng
 * @param {number} startLat
 * @param {number} endLng
 * @param {number} endLat
 * @returns {{ geometry, distance, duration, steps } | { error: string }}
 */
export function findCampusRoute(startLng, startLat, endLng, endLat) {
  try {
    buildGraph();

    // ── Snap start & end to the nearest point on the walkable network ───
    const startSnap = snapToNetwork([startLng, startLat]);
    const endSnap   = snapToNetwork([endLng, endLat]);

    if (!startSnap.point || !endSnap.point) {
      return { error: 'Could not snap start or destination to a walkable path.' };
    }

    // Find nearest graph nodes for A* start & end
    const startNode = nearestGraphNode(startSnap.point.geometry.coordinates);
    const endNode   = nearestGraphNode(endSnap.point.geometry.coordinates);

    if (!startNode.key || !endNode.key) {
      return { error: 'Could not map locations to walkable network nodes.' };
    }

    // ── Run A* search ────────────────────────────────────────────────────
    const pathCoords = astarSearch(startNode.key, endNode.key);

    if (!pathCoords || pathCoords.length < 2) {
      return { error: 'No walkable path found between locations within campus.' };
    }

    // Build coordinate list: user location → graph path → destination
    const fullCoords = [];

    // Prepend user's actual start so the route visually begins at their location
    const firstNode = pathCoords[0];
    const dStart = turf.distance(
      turf.point([startLng, startLat]),
      turf.point(firstNode),
      { units: 'meters' },
    );
    if (dStart > 1) fullCoords.push([startLng, startLat]);

    // A* path (strictly follows graph edges / gray lines)
    fullCoords.push(...pathCoords);

    // Append actual destination so the route ends at the building
    const lastNode = pathCoords[pathCoords.length - 1];
    const dEnd = turf.distance(
      turf.point([endLng, endLat]),
      turf.point(lastNode),
      { units: 'meters' },
    );
    if (dEnd > 1) fullCoords.push([endLng, endLat]);

    // Directions
    const { steps, totalDistance, totalDuration } = generateDirections(fullCoords);

    return {
      geometry: { type: 'LineString', coordinates: fullCoords },
      distance: totalDistance,
      duration: totalDuration,
      steps,
    };
  } catch (err) {
    console.error('Campus pathfinding error:', err);
    return { error: err.message || 'Pathfinding failed' };
  }
}

/**
 * Check whether a coordinate is inside the campus boundary.
 */
export function isInsideCampus(lng, lat) {
  try {
    return turf.booleanPointInPolygon(turf.point([lng, lat]), campusPolygon);
  } catch {
    return false;
  }
}

/**
 * Find the nearest point on the campus boundary to the given coordinate.
 * Returns [lng, lat].
 */
export function nearestPointOnCampus(lng, lat) {
  try {
    const pt = turf.point([lng, lat]);
    const line = turf.polygonToLine(campusPolygon);
    const snapped = turf.nearestPointOnLine(line, pt);
    return snapped.geometry.coordinates;
  } catch {
    return [lng, lat];
  }
}

/**
 * Snap a GPS location to the nearest point on the walkable network.
 * Returns { lng, lat, distanceM } or null.
 */
export function snapToNearestPath(lng, lat) {
  try {
    const { point, distanceM } = snapToNetwork([lng, lat]);
    if (!point) return null;
    const [sLng, sLat] = point.geometry.coordinates;
    return { lng: sLng, lat: sLat, distanceM };
  } catch {
    return null;
  }
}

/**
 * Get the walkable-paths FeatureCollection (for map display).
 * Built from the pre-defined graph edges.
 */
export function getWalkablePathsGeoJSON() {
  return getWalkableGeoJSON();
}

/**
 * Reset the cached pathfinder (call if walkable paths change at runtime).
 */
export function resetPathfinder() {
  _graph = null;
  _coords = null;
  _walkableGeoJSON = null;
}