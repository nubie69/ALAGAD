const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Helper to validate coordinates
const isValidCoordinates = (coords, depth = 0) => {
  if (!Array.isArray(coords)) return false;
  if (coords.length === 0) return false;

  if (depth === 0) {
    // Top level should be numbers [lng, lat]
    return coords.length === 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number' &&
      !isNaN(coords[0]) &&
      !isNaN(coords[1]) &&
      isFinite(coords[0]) &&
      isFinite(coords[1]);
  }

  // Recursive check for nested arrays
  return coords.every(coord => isValidCoordinates(coord, depth - 1));
};

// Validate geometry
const isGeometryValid = (geometry) => {
  try {
    if (!geometry || !geometry.type) return false;
    if (!Array.isArray(geometry.coordinates)) return false;

    switch (geometry.type) {
      case 'Point':
        return isValidCoordinates(geometry.coordinates, 0);
      case 'LineString':
        return geometry.coordinates.length >= 2 && geometry.coordinates.every(c => isValidCoordinates(c, 0));
      case 'Polygon':
        return geometry.coordinates.every(ring => Array.isArray(ring) && ring.every(c => isValidCoordinates(c, 0)));
      case 'MultiPolygon':
        return geometry.coordinates.every(polygon =>
          Array.isArray(polygon) && polygon.every(ring => Array.isArray(ring) && ring.every(c => isValidCoordinates(c, 0)))
        );
      default:
        return false;
    }
  } catch (err) {
    console.error('Error validating geometry:', err);
    return false;
  }
};

const cleanupMapFeatures = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');

    // Access the map features collection
    const db = mongoose.connection;
    const mapFeaturesCollection = db.collection('mapfeatures');

    // Find all documents
    const allDocs = await mapFeaturesCollection.find({}).toArray();
    console.log(`📊 Total map feature documents: ${allDocs.length}`);

    let removedCount = 0;
    const invalidDocs = [];

    // Check each document
    for (const doc of allDocs) {
      if (doc.features && Array.isArray(doc.features)) {
        const validFeatures = doc.features.filter(feature => {
          const isValid = isGeometryValid(feature.geometry);
          if (!isValid) {
            invalidDocs.push(feature);
          }
          return isValid;
        });

        if (validFeatures.length < doc.features.length) {
          const removed = doc.features.length - validFeatures.length;
          console.log(`⚠️  Removing ${removed} invalid features from document ${doc._id}`);

          if (validFeatures.length > 0) {
            // Update with valid features only
            await mapFeaturesCollection.updateOne(
              { _id: doc._id },
              { $set: { features: validFeatures } }
            );
          } else {
            // Delete if no valid features remain
            await mapFeaturesCollection.deleteOne({ _id: doc._id });
          }
          removedCount += removed;
        }
      }
    }

    console.log(`\n✅ Cleanup Summary:`);
    console.log(`   Total invalid features removed: ${removedCount}`);
    console.log(`   Documents cleaned: ${removedCount > 0 ? 'Yes' : 'No'}`);

    if (invalidDocs.length > 0) {
      console.log(`\n🔍 Sample invalid features:`);
      invalidDocs.slice(0, 3).forEach(feature => {
        console.log(`   - Type: ${feature.geometry?.type}, Coords: ${JSON.stringify(feature.geometry?.coordinates).substring(0, 50)}...`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  }
};

cleanupMapFeatures();
