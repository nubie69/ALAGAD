import React, { useEffect, useState } from 'react';
import { Layer, Source, useMap } from 'react-map-gl';
import treeGeoJSON from '../data/trees.json';

const TREE_ICONS = [
  { id: 'alagad-map-tree-dark', url: '/Tree-canopy-dark-v3.png' },
  { id: 'alagad-map-tree-green', url: '/Tree-canopy-green-v3.png' },
  { id: 'alagad-map-tree-gold', url: '/Tree-canopy-gold-v3.png' },
];

const MapTrees = ({ idPrefix = 'map-trees', beforeId }) => {
  const { current: mapRef } = useMap();
  const [treeIconsReady, setTreeIconsReady] = useState(false);

  useEffect(() => {
    const map = mapRef?.getMap ? mapRef.getMap() : mapRef;
    if (!map) return undefined;

    let cancelled = false;

    const registerTreeIcons = () => {
      try {
        if (TREE_ICONS.every(icon => map.hasImage(icon.id))) {
          setTreeIconsReady(true);
          return;
        }

        Promise.all(TREE_ICONS.map(icon => new Promise((resolve, reject) => {
          if (map.hasImage(icon.id)) {
            resolve();
            return;
          }

          map.loadImage(icon.url, (error, image) => {
            if (error || !image) {
              reject(error || new Error(`Missing tree image: ${icon.url}`));
              return;
            }

            if (!map.hasImage(icon.id)) {
              map.addImage(icon.id, image, { pixelRatio: 2 });
            }
            resolve();
          });
        })))
          .then(() => {
            if (!cancelled) setTreeIconsReady(true);
          })
          .catch(error => {
            if (!cancelled) {
              console.error('MapTrees: Failed to load tree icons', error);
              setTreeIconsReady(false);
            }
          });
      } catch (err) {
        console.error('MapTrees: Error registering tree icons', err);
        setTreeIconsReady(false);
      }
    };

    if (map.isStyleLoaded()) {
      registerTreeIcons();
    } else {
      map.once('style.load', registerTreeIcons);
    }

    return () => {
      cancelled = true;
      map.off('style.load', registerTreeIcons);
    };
  }, [mapRef]);

  if (!treeIconsReady || !treeGeoJSON?.features?.length) {
    return null;
  }

  return (
    <Source id={`${idPrefix}-source`} type="geojson" data={treeGeoJSON}>
      <Layer
        id={`${idPrefix}-symbols`}
        beforeId={beforeId}
        type="symbol"
        layout={{
          'icon-image': ['coalesce', ['get', 'iconImage'], 'alagad-map-tree-green'],
          'icon-size': ['*', ['coalesce', ['get', 'iconSize'], 1], 0.9],
          'icon-rotate': ['coalesce', ['get', 'rotate'], 0],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-sort-key': ['coalesce', ['get', 'iconSize'], 1],
          'symbol-z-order': 'auto',
        }}
      />
    </Source>
  );
};

export default MapTrees;
