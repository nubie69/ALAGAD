const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

const [sourcePath, grassOutputPath, treeOutputPath] = process.argv.slice(2);

if (!sourcePath || !grassOutputPath || !treeOutputPath) {
  console.error('Usage: node scripts/generate-landscape-data.js <source.geojson> <grass.json> <trees.json>');
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

const coordinatesEqual = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];

const removeConsecutiveDuplicates = ring => ring.filter((coordinate, index) => (
  index === 0 || !coordinatesEqual(coordinate, ring[index - 1])
));

const normalizePolygonRings = rings => {
  let outerRing = removeConsecutiveDuplicates(rings[0]);
  const holeRings = rings.slice(1).map(removeConsecutiveDuplicates);
  let loopFound = true;

  // Convert retraced A-B-...-B-A loops into proper interior holes.
  while (loopFound) {
    loopFound = false;
    for (let start = 0; start < outerRing.length - 4; start += 1) {
      for (let end = start + 3; end < outerRing.length - 1; end += 1) {
        if (
          coordinatesEqual(outerRing[start], outerRing[end + 1]) &&
          coordinatesEqual(outerRing[start + 1], outerRing[end])
        ) {
          const hole = outerRing.slice(start + 1, end + 1);
          if (hole.length >= 4) holeRings.push(hole);
          outerRing = outerRing.slice(0, start + 1).concat(outerRing.slice(end + 2));
          loopFound = true;
          break;
        }
      }
      if (loopFound) break;
    }
  }

  return [outerRing, ...holeRings];
};

const normalizeFeature = feature => {
  if (feature?.geometry?.type === 'Polygon') {
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: normalizePolygonRings(feature.geometry.coordinates),
      },
    };
  }

  if (feature?.geometry?.type === 'MultiPolygon') {
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: feature.geometry.coordinates.map(normalizePolygonRings),
      },
    };
  }

  return feature;
};

const classifyGrass = areaSqM => {
  if (areaSqM >= 10000) return 'campus-green';
  if (areaSqM >= 750) return 'large-lawn';
  if (areaSqM >= 125) return 'lawn-pocket';
  return 'lawn-strip';
};

const validSourceFeatures = source.features
  .map((feature, sourceIndex) => ({ feature: normalizeFeature(feature), sourceIndex }))
  .map(item => ({ ...item, areaSqM: turf.area(item.feature) }))
  .filter(({ feature, areaSqM }) => (
    ['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type) && areaSqM >= 1
  ));

const grassFeatures = validSourceFeatures.map(({ feature, sourceIndex, areaSqM }, index) => {
  const grassClass = classifyGrass(areaSqM);

  return {
    type: 'Feature',
    id: `grass-${String(index + 1).padStart(2, '0')}`,
    properties: {
      ...feature.properties,
      id: `grass-${String(index + 1).padStart(2, '0')}`,
      type: 'grass',
      surface: 'grass',
      texture: 'grass',
      fillPattern: 'grass',
      grassClass,
      areaSqM: Number(areaSqM.toFixed(2)),
      placementOrder: index + 1,
      sourceFeatureIndex: sourceIndex,
      textureScale: grassClass === 'campus-green' ? 0.9 : 0.8,
      textureDetail: 'fine-blade-mottled',
    },
    geometry: feature.geometry,
  };
});

const sourceFeatureMap = new Map(validSourceFeatures.map(item => [item.sourceIndex, item]));
const trees = [];
const treeSizes = [0.76, 0.88, 1, 1.12, 0.94, 1.2, 0.82, 1.06];

const addTree = (coordinates, size, placement, sourceFeatureIndex, sequence) => {
  const roundedSize = Number(size.toFixed(2));
  const sizeClass = roundedSize >= 1.1 ? 'large' : roundedSize <= 0.84 ? 'small' : 'medium';
  const treeNumber = trees.length + 1;

  trees.push({
    type: 'Feature',
    id: `tree-${String(treeNumber).padStart(3, '0')}`,
    properties: {
      id: `tree-${String(treeNumber).padStart(3, '0')}`,
      type: 'tree',
      source: 'reference-map',
      placement,
      sourceGrassFeature: sourceFeatureIndex,
      sizeClass,
      iconSize: roundedSize,
      canopyDiameterMeters: Number((6.5 * roundedSize).toFixed(1)),
      rotate: (sourceFeatureIndex * 47 + sequence * 73) % 360,
    },
    geometry: {
      type: 'Point',
      coordinates: coordinates.map(value => Number(value.toFixed(8))),
    },
  });
};

const isFarEnough = (candidate, minimumMeters) => trees.every(tree => (
  turf.distance(candidate, tree, { units: 'meters' }) >= minimumMeters
));

const moveInsideGrass = (candidate, grassFeature) => {
  const interiorPoint = turf.pointOnFeature(grassFeature);
  const bearing = turf.bearing(candidate, interiorPoint);

  for (const distanceMeters of [1.5, 3, 6, 12, 24]) {
    const insetPoint = turf.destination(candidate, distanceMeters, bearing, { units: 'meters' });
    if (turf.booleanPointInPolygon(insetPoint, grassFeature, { ignoreBoundary: false })) {
      return insetPoint;
    }
  }

  return interiorPoint;
};

const addBoundaryTrees = ({ sourceFeatureIndex, spacingMeters, maximum, placement, sizeBoost = 0 }) => {
  const sourceFeature = sourceFeatureMap.get(sourceFeatureIndex)?.feature;
  if (!sourceFeature) return;

  const boundary = turf.polygonToLine(sourceFeature);
  const lines = boundary.geometry.type === 'MultiLineString'
    ? boundary.geometry.coordinates.map(coordinates => turf.lineString(coordinates))
    : [boundary];
  let sequence = 0;

  lines.forEach(line => {
    const lengthMeters = turf.length(line, { units: 'meters' });
    for (let distance = spacingMeters * 0.35; distance < lengthMeters && sequence < maximum; distance += spacingMeters) {
      const boundaryPoint = turf.along(line, distance, { units: 'meters' });
      const point = moveInsideGrass(boundaryPoint, sourceFeature);
      if (!isFarEnough(point, Math.min(11, spacingMeters * 0.38))) continue;

      const baseSize = treeSizes[(sequence + sourceFeatureIndex) % treeSizes.length];
      addTree(point.geometry.coordinates, baseSize + sizeBoost, placement, sourceFeatureIndex, sequence);
      sequence += 1;
    }
  });
};

// Densities follow the reference map: a strong western/perimeter tree belt,
// a dense northern garden, and smaller rows and clusters around lawn pockets.
[
  { sourceFeatureIndex: 1, spacingMeters: 38, maximum: 62, placement: 'campus-perimeter' },
  { sourceFeatureIndex: 14, spacingMeters: 22, maximum: 20, placement: 'northern-grove', sizeBoost: 0.08 },
  { sourceFeatureIndex: 2, spacingMeters: 58, maximum: 6, placement: 'track-field-edge' },
  { sourceFeatureIndex: 8, spacingMeters: 29, maximum: 2, placement: 'lawn-cluster' },
  { sourceFeatureIndex: 19, spacingMeters: 28, maximum: 5, placement: 'east-lawn-row' },
  { sourceFeatureIndex: 20, spacingMeters: 43, maximum: 3, placement: 'west-lawn-row' },
  { sourceFeatureIndex: 23, spacingMeters: 29, maximum: 5, placement: 'central-lawn-row' },
].forEach(addBoundaryTrees);

// The smaller landscaped islands in the reference carry one compact tree each.
[4, 6, 9, 10, 11, 17, 21, 24].forEach((sourceFeatureIndex, index) => {
  const sourceFeature = sourceFeatureMap.get(sourceFeatureIndex)?.feature;
  if (!sourceFeature) return;
  const point = turf.pointOnFeature(sourceFeature);
  if (isFarEnough(point, 8)) {
    addTree(point.geometry.coordinates, 0.72 + (index % 3) * 0.08, 'landscape-island', sourceFeatureIndex, index);
  }
});

const grassCollection = { type: 'FeatureCollection', features: grassFeatures };
const treeCollection = {
  type: 'FeatureCollection',
  properties: {
    source: path.basename(sourcePath),
    placementReference: 'campus-map-removebg-preview (1).png',
    placementStyle: 'perimeter rows, northern grove, and lawn clusters',
  },
  features: trees,
};

fs.writeFileSync(grassOutputPath, `${JSON.stringify(grassCollection, null, 2)}\n`);
fs.writeFileSync(treeOutputPath, `${JSON.stringify(treeCollection, null, 2)}\n`);

console.log(`Wrote ${grassFeatures.length} grass features and ${trees.length} tree features.`);
