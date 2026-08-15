import React from 'react';
import '../styles/BuildingPinMarker.css';

export const BuildingPinMarker = ({
  label = '',
  color = '#D93025',
  highlighted = false,
  dimmed = false,
  showLabel = true,
  compact = false,
}) => {
  const className = [
    'building-pin-marker',
    highlighted ? 'building-pin-marker--highlighted' : '',
    dimmed ? 'building-pin-marker--dimmed' : '',
    compact ? 'building-pin-marker--compact' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <div className="building-pin-marker__pin" aria-hidden="true">
        <svg viewBox="0 0 36 48" className="building-pin-marker__svg">
          <path
            d="M18 1C8.611 1 1 8.611 1 18c0 12.749 15.461 27.428 16.119 28.045a1.28 1.28 0 0 0 1.762 0C19.539 45.428 35 30.749 35 18 35 8.611 27.389 1 18 1Z"
            fill={color}
          />
          <circle cx="18" cy="18" r="7.25" fill="#FFFFFF" />
          <circle cx="18" cy="18" r="3.3" fill={color} />
        </svg>
      </div>
      {showLabel && label ? (
        <span className="building-pin-marker__label">{label}</span>
      ) : null}
    </div>
  );
};

export default BuildingPinMarker;
