import React, { useEffect, useState } from 'react';
import { Layer, Source, useMap } from 'react-map-gl';
import trackAndFieldGeoJSON from '../data/trackNField.json';

const TRACK_FIELD_PATTERN_ID = 'alagad-track-field-grass';
const MAIN_GRASS_PATTERN_ID = 'alagad-grass-pattern';
const PUBLIC_ASSET_ROOT = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const TRACK_FIELD_TEXTURE_URL = `${PUBLIC_ASSET_ROOT}/Track-field-grass-v1.png`;

const TrackAndField = ({ idPrefix = 'track-and-field', beforeId }) => {
  const { current: mapRef } = useMap();
  const [textureReady, setTextureReady] = useState(false);

  useEffect(() => {
    const map = mapRef?.getMap ? mapRef.getMap() : mapRef;
    if (!map) return undefined;

    let cancelled = false;
    let registrationId = 0;

    const registerTexture = () => {
      const currentRegistrationId = ++registrationId;

      try {
        if (map.hasImage(TRACK_FIELD_PATTERN_ID)) {
          setTextureReady(true);
          return;
        }

        setTextureReady(false);
        map.loadImage(TRACK_FIELD_TEXTURE_URL, (error, image) => {
          if (cancelled || currentRegistrationId !== registrationId) return;

          if (error || !image) {
            console.error('TrackAndField: Failed to load grass texture', error);
            return;
          }

          if (!map.hasImage(TRACK_FIELD_PATTERN_ID)) {
            map.addImage(TRACK_FIELD_PATTERN_ID, image, { pixelRatio: 8 });
          }
          setTextureReady(true);
        });
      } catch (error) {
        console.error('TrackAndField: Error registering grass texture', error);
        setTextureReady(false);
      }
    };

    const handleStyleImageMissing = (event) => {
      if (event?.id === TRACK_FIELD_PATTERN_ID) registerTexture();
    };

    map.on('style.load', registerTexture);
    map.on('styleimagemissing', handleStyleImageMissing);

    if (map.isStyleLoaded()) registerTexture();

    return () => {
      cancelled = true;
      registrationId += 1;
      map.off('style.load', registerTexture);
      map.off('styleimagemissing', handleStyleImageMissing);
    };
  }, [mapRef]);

  return (
    <Source id={`${idPrefix}-source`} type="geojson" data={trackAndFieldGeoJSON}>
      <Layer
        id={`${idPrefix}-field-grass`}
        beforeId={beforeId}
        type="fill"
        filter={['==', ['get', 'kind'], 'field-grass']}
        paint={{
          'fill-pattern': MAIN_GRASS_PATTERN_ID,
          'fill-opacity': 1,
        }}
      />
      <Layer
        id={`${idPrefix}-running-track`}
        beforeId={beforeId}
        type="fill"
        filter={['==', ['get', 'kind'], 'running-track']}
        paint={textureReady
          ? {
              'fill-pattern': TRACK_FIELD_PATTERN_ID,
              'fill-opacity': 1,
            }
          : {
              'fill-color': '#9eab55',
              'fill-opacity': 1,
            }}
      />
      <Layer
        id={`${idPrefix}-side-feature`}
        beforeId={beforeId}
        type="fill"
        filter={['==', ['get', 'kind'], 'track-side-feature']}
        paint={textureReady
          ? {
              'fill-pattern': TRACK_FIELD_PATTERN_ID,
              'fill-opacity': 1,
            }
          : {
              'fill-color': '#9eab55',
              'fill-opacity': 1,
            }}
      />
    </Source>
  );
};

export default TrackAndField;
