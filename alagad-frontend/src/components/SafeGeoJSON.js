import React from 'react';
import { Source, Layer } from 'react-map-gl';

// Safe GeoJSON wrapper that catches rendering errors
export const SafeGeoJSON = ({ data, onEachFeature }) => {
  try {
    if (!data || !data.features || !Array.isArray(data.features)) {
      console.warn('SafeGeoJSON: Invalid data structure', data);
      return null;
    }

    // Validate and filter features
    const validFeatures = data.features.filter(feature => {
      try {
        const geom = feature?.geometry;
        if (!geom || !geom.type) {
          console.warn('SafeGeoJSON: Missing geometry type', feature);
          return false;
        }

        // Skip building and office type points (handled by BuildingMarkers / OfficeMarkers)
        if (geom.type === 'Point' && (feature.properties?.type === 'building' || feature.properties?.type === 'office')) {
          return false;
        }

        // Check coordinates
        if (!Array.isArray(geom.coordinates)) {
          console.warn('SafeGeoJSON: Invalid coordinates array', feature);
          return false;
        }

        // Validate based on type
        switch (geom.type) {
          case 'Point':
            if (geom.coordinates.length !== 2) return false;
            if (geom.coordinates.some(c => typeof c !== 'number' || !isFinite(c))) return false;
            return true;

          case 'LineString':
          case 'MultiPoint':
            if (!Array.isArray(geom.coordinates[0])) return false;
            return true;

          case 'Polygon':
          case 'MultiLineString':
            if (!Array.isArray(geom.coordinates[0]?.[0])) return false;
            return true;

          case 'MultiPolygon':
            if (!Array.isArray(geom.coordinates[0]?.[0]?.[0])) return false;
            return true;

          default:
            console.warn('SafeGeoJSON: Unknown geometry type', geom.type);
            return false;
        }
      } catch (err) {
        console.error('SafeGeoJSON: Error validating feature', feature, err);
        return false;
      }
    });

    if (validFeatures.length === 0) {
      return null;
    }

    const safeData = {
      type: 'FeatureCollection',
      features: validFeatures,
    };

    // Polygon/MultiPolygon layer styling
    const polygonLayerStyle = {
      id: 'geojson-polygon',
      type: 'fill',
      paint: {
        'fill-color': '#088',
        'fill-opacity': 0.4,
      },
    };

    const polygonOutlineStyle = {
      id: 'geojson-polygon-outline',
      type: 'line',
      paint: {
        'line-color': '#088',
        'line-width': 2,
      },
    };

    // Point layer styling
    const pointLayerStyle = {
      id: 'geojson-point',
      type: 'circle',
      paint: {
        'circle-radius': 6,
        'circle-color': '#088',
      },
    };

    // LineString layer styling
    const lineLayerStyle = {
      id: 'geojson-line',
      type: 'line',
      paint: {
        'line-color': '#088',
        'line-width': 2,
      },
    };

    return (
      <Source id="geojson-source" type="geojson" data={safeData}>
        <Layer {...polygonLayerStyle} />
        <Layer {...polygonOutlineStyle} />
        <Layer {...pointLayerStyle} />
        <Layer {...lineLayerStyle} />
      </Source>
    );
  } catch (err) {
    console.error('SafeGeoJSON: Rendering error', err);
    return null;
  }
};

export default SafeGeoJSON;
