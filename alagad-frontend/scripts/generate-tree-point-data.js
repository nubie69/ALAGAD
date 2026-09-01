const fs = require('fs');
const path = require('path');

const [sourcePath, outputPath] = process.argv.slice(2);

if (!sourcePath || !outputPath) {
  console.error('Usage: node scripts/generate-tree-point-data.js <source.geojson> <trees.json>');
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const sizeCycle = [0.72, 0.84, 0.96, 1.08, 0.78, 1.18, 0.9, 1.26, 1.02];
const variantCycle = [
  ['dark', 'alagad-map-tree-dark'],
  ['green', 'alagad-map-tree-green'],
  ['green', 'alagad-map-tree-green'],
  ['dark', 'alagad-map-tree-dark'],
  ['gold', 'alagad-map-tree-gold'],
  ['green', 'alagad-map-tree-green'],
  ['dark', 'alagad-map-tree-dark'],
  ['green', 'alagad-map-tree-green'],
  ['gold', 'alagad-map-tree-gold'],
  ['dark', 'alagad-map-tree-dark'],
];

const pointFeatures = (source.features || []).filter(feature => (
  feature?.geometry?.type === 'Point' &&
  Array.isArray(feature.geometry.coordinates) &&
  feature.geometry.coordinates.length >= 2 &&
  feature.geometry.coordinates.slice(0, 2).every(Number.isFinite)
));

const trees = pointFeatures.map((feature, index) => {
  const [longitude, latitude] = feature.geometry.coordinates;
  const coordinateSeed = Math.abs(Math.round((longitude * 1e6) + (latitude * 1e6)));
  const size = sizeCycle[(coordinateSeed + index) % sizeCycle.length];
  const [canopyVariant, iconImage] = variantCycle[(coordinateSeed + (index * 3)) % variantCycle.length];
  const sizeClass = size >= 1.12 ? 'large' : size <= 0.82 ? 'small' : 'medium';

  return {
    type: 'Feature',
    id: `tree-${String(index + 1).padStart(3, '0')}`,
    properties: {
      ...feature.properties,
      id: `tree-${String(index + 1).padStart(3, '0')}`,
      type: 'tree',
      source: path.basename(sourcePath),
      sourceFeatureIndex: source.features.indexOf(feature),
      canopyVariant,
      iconImage,
      iconSize: size,
      sizeClass,
      canopyDiameterMeters: Number((6.2 * size).toFixed(1)),
      rotate: (coordinateSeed + (index * 67)) % 360,
    },
    geometry: {
      type: 'Point',
      coordinates: [longitude, latitude],
    },
  };
});

const output = {
  type: 'FeatureCollection',
  properties: {
    source: path.basename(sourcePath),
    pointCount: trees.length,
    styleReference: 'campus-map-removebg-preview (1).png',
    canopyVariants: ['dark', 'green', 'gold'],
  },
  features: trees,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${trees.length} tree points.`);
