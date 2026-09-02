import React, { useEffect, useState } from 'react';
import { Layer, Source, useMap } from 'react-map-gl';
import treeGeoJSON from '../data/trees.json';

const TREE_ICONS = [
  { id: 'alagad-map-tree-dark', file: 'Tree-canopy-dark-v3.png' },
  { id: 'alagad-map-tree-green', file: 'Tree-canopy-green-v3.png' },
  { id: 'alagad-map-tree-gold', file: 'Tree-canopy-gold-v3.png' },
];
const PUBLIC_ASSET_ROOT = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

const MapTrees = ({ idPrefix = 'map-trees', beforeId }) => {
  const { current: mapRef } = useMap();
  const [treeIconsReady, setTreeIconsReady] = useState(false);

  useEffect(() => {
    const map = mapRef?.getMap ? mapRef.getMap() : mapRef;
    if (!map) return undefined;

    let cancelled = false;
    let registrationId = 0;

    const registerTreeIcons = () => {
      const currentRegistrationId = ++registrationId;

      try {
        if (TREE_ICONS.every(icon => map.hasImage(icon.id))) {
          setTreeIconsReady(true);
          return;
        }

        setTreeIconsReady(false);
        Promise.all(TREE_ICONS.map(icon => new Promise((resolve, reject) => {
          if (map.hasImage(icon.id)) {
            resolve();
            return;
          }

          const iconUrl = `${PUBLIC_ASSET_ROOT}/${icon.file}`;
          map.loadImage(iconUrl, (error, image) => {
            if (cancelled || currentRegistrationId !== registrationId) {
              resolve();
              return;
            }

            if (error || !image) {
              reject(error || new Error(`Missing tree image: ${iconUrl}`));
              return;
            }

            if (!map.hasImage(icon.id)) {
              map.addImage(icon.id, image, { pixelRatio: 2 });
            }
            resolve();
          });
        })))
          .then(() => {
            if (!cancelled && currentRegistrationId === registrationId) {
              setTreeIconsReady(TREE_ICONS.every(icon => map.hasImage(icon.id)));
            }
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

    const handleStyleImageMissing = (event) => {
      if (TREE_ICONS.some(icon => icon.id === event?.id)) registerTreeIcons();
    };

    map.on('style.load', registerTreeIcons);
    map.on('styleimagemissing', handleStyleImageMissing);

    if (map.isStyleLoaded()) {
      registerTreeIcons();
    }

    return () => {
      cancelled = true;
      registrationId += 1;
      map.off('style.load', registerTreeIcons);
      map.off('styleimagemissing', handleStyleImageMissing);
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
