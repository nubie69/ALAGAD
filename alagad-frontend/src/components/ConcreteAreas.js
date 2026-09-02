import React from 'react';
import { Layer, Source } from 'react-map-gl';
import concreteGeoJSON from '../data/concrete.json';

const ConcreteAreas = ({ idPrefix = 'concrete-areas', beforeId }) => (
  <Source id={`${idPrefix}-source`} type="geojson" data={concreteGeoJSON}>
    <Layer
      id={`${idPrefix}-fill`}
      beforeId={beforeId}
      type="fill"
      paint={{
        'fill-color': '#d7d5cb',
        'fill-opacity': 1,
        'fill-antialias': false,
      }}
    />
  </Source>
);

export default ConcreteAreas;
