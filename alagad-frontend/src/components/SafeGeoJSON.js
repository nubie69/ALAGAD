import React, { useEffect, useMemo, useState } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';

const GRASS_PATTERN_ID = 'alagad-grass-pattern';
const GRASS_PATTERN_URL = '/Grass-map-style-v2.png';
const POLYGON_GEOMETRY_FILTER = [
  'any',
  ['==', ['geometry-type'], 'Polygon'],
  ['==', ['geometry-type'], 'MultiPolygon'],
];
const GRASS_FEATURE_FILTER = [
  'any',
  ['==', ['get', 'surface'], 'grass'],
  ['==', ['get', 'texture'], 'grass'],
  ['==', ['get', 'fillPattern'], 'grass'],
  ['!', ['has', 'type']],
];

// Safe GeoJSON wrapper that catches rendering errors
export const SafeGeoJSON = ({ data, onEachFeature, idPrefix = 'geojson', showPoints = true, beforeId }) => {
  const { current: mapRef } = useMap();
  const [grassPatternReady, setGrassPatternReady] = useState(false);

  useEffect(() => {
    const map = mapRef?.getMap ? mapRef.getMap() : mapRef;
    if (!map) return undefined;

    let cancelled = false;

    const registerGrassPattern = () => {
      try {
        if (map.hasImage(GRASS_PATTERN_ID)) {
          setGrassPatternReady(true);
          return;
        }

        map.loadImage(GRASS_PATTERN_URL, (error, image) => {
          if (cancelled) return;

          if (error || !image) {
            console.error('SafeGeoJSON: Failed to load grass texture', error);
            setGrassPatternReady(false);
            return;
          }

          if (!map.hasImage(GRASS_PATTERN_ID)) {
            map.addImage(GRASS_PATTERN_ID, image, { pixelRatio: 1 });
          }
          setGrassPatternReady(true);
        });
      } catch (err) {
        console.error('SafeGeoJSON: Error registering grass texture', err);
        setGrassPatternReady(false);
      }
    };

    if (map.isStyleLoaded()) {
      registerGrassPattern();
    } else {
      map.once('style.load', registerGrassPattern);
    }

    return () => {
      cancelled = true;
      map.off('style.load', registerGrassPattern);
    };
  }, [mapRef]);

  const safeData = useMemo(() => {
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

      return {
        type: 'FeatureCollection',
        features: validFeatures,
      };
    } catch (err) {
      console.error('SafeGeoJSON: Rendering error', err);
      return null;
    }
  }, [data]);

  try {
    if (!safeData) {
      return null;
    }

    // Polygon/MultiPolygon layer styling
    const grassPolygonLayerStyle = {
      id: `${idPrefix}-grass-polygon`,
      beforeId,
      type: 'fill',
      filter: ['all', POLYGON_GEOMETRY_FILTER, GRASS_FEATURE_FILTER],
      paint: grassPatternReady
        ? {
            'fill-pattern': GRASS_PATTERN_ID,
            'fill-opacity': 1,
          }
        : {
            'fill-color': '#3f7f2f',
            'fill-opacity': 0.65,
          },
    };

    const polygonLayerStyle = {
      id: `${idPrefix}-polygon`,
      beforeId,
      type: 'fill',
      filter: ['all', POLYGON_GEOMETRY_FILTER, ['!', GRASS_FEATURE_FILTER]],
      paint: {
        'fill-color': '#088',
        'fill-opacity': 0.4,
      },
    };

    const polygonOutlineStyle = {
      id: `${idPrefix}-polygon-outline`,
      beforeId,
      type: 'line',
      filter: ['all', POLYGON_GEOMETRY_FILTER, ['!', GRASS_FEATURE_FILTER]],
      paint: {
        'line-color': 'transparent',
        'line-width': 0,
        'line-opacity': 0,
      },
    };

    // Point layer styling
    const pointLayerStyle = {
      id: `${idPrefix}-point`,
      beforeId,
      type: 'circle',
      paint: {
        'circle-radius': 6,
        'circle-color': '#088',
      },
    };

    // LineString layer styling
    const lineLayerStyle = {
      id: `${idPrefix}-line`,
      beforeId,
      type: 'line',
      paint: {
        'line-color': 'transparent',
        'line-width': 0,
        'line-opacity': 0,
      },
    };

    return (
      <Source id={`${idPrefix}-source`} type="geojson" data={safeData}>
        <Layer {...grassPolygonLayerStyle} />
        <Layer {...polygonLayerStyle} />
        <Layer {...polygonOutlineStyle} />
        {showPoints && <Layer {...pointLayerStyle} />}
        <Layer {...lineLayerStyle} />
      </Source>
    );
  } catch (err) {
    console.error('SafeGeoJSON: Rendering error', err);
    return null;
  }
};

export default SafeGeoJSON;
