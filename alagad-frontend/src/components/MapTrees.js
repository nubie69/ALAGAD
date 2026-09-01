import React, { useEffect, useState } from 'react';
import { Layer, Source, useMap } from 'react-map-gl';
import treeGeoJSON from '../data/trees.json';

const TREE_ICON_ID = 'alagad-map-tree';
const TREE_ICON_URL = '/Tree-map-style-v2.png';

const MapTrees = ({ idPrefix = 'map-trees' }) => {
  const { current: mapRef } = useMap();
  const [treeIconReady, setTreeIconReady] = useState(false);

  useEffect(() => {
    const map = mapRef?.getMap ? mapRef.getMap() : mapRef;
    if (!map) return undefined;

    let cancelled = false;

    const registerTreeIcon = () => {
      try {
        if (map.hasImage(TREE_ICON_ID)) {
          setTreeIconReady(true);
          return;
        }

        map.loadImage(TREE_ICON_URL, (error, image) => {
          if (cancelled) return;

          if (error || !image) {
            console.error('MapTrees: Failed to load tree icon', error);
            setTreeIconReady(false);
            return;
          }

          if (!map.hasImage(TREE_ICON_ID)) {
            map.addImage(TREE_ICON_ID, image, { pixelRatio: 2 });
          }
          setTreeIconReady(true);
        });
      } catch (err) {
        console.error('MapTrees: Error registering tree icon', err);
        setTreeIconReady(false);
      }
    };

    if (map.isStyleLoaded()) {
      registerTreeIcon();
    } else {
      map.once('style.load', registerTreeIcon);
    }

    return () => {
      cancelled = true;
      map.off('style.load', registerTreeIcon);
    };
  }, [mapRef]);

  if (!treeIconReady || !treeGeoJSON?.features?.length) {
    return null;
  }

  return (
    <Source id={`${idPrefix}-source`} type="geojson" data={treeGeoJSON}>
      <Layer
        id={`${idPrefix}-symbols`}
        type="symbol"
        layout={{
          'icon-image': TREE_ICON_ID,
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            16, ['*', ['coalesce', ['get', 'iconSize'], 1], 0.18],
            18, ['*', ['coalesce', ['get', 'iconSize'], 1], 0.28],
            20, ['*', ['coalesce', ['get', 'iconSize'], 1], 0.4],
          ],
          'icon-rotate': ['coalesce', ['get', 'rotate'], 0],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-z-order': 'source',
        }}
      />
    </Source>
  );
};

export default MapTrees;
