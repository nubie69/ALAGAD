import React from 'react';

/**
 * CampusBoundaryFocus
 *
 * Creates a smooth edge-fade effect around the map container:
 *   • Center of the map → crystal clear, fully visible
 *   • Edges             → soft gradient blur / darkening that fades inward
 *
 * Uses four overlay divs (top, bottom, left, right) with linear gradients
 * for a clean, even edge fade with no diagonal artifacts.
 * All overlays use pointer-events: none so the map remains fully interactive.
 */
const CampusBoundaryFocus = ({
  darkenOpacity = 0.35,
  fadeRadius = 30,
}) => {
  // How many pixels the fade extends inward from each edge
  const fadeSize = fadeRadius * 2.5;
  const edgeColor = `rgba(15, 23, 42, ${darkenOpacity})`;
  const edgeColorTransparent = 'rgba(15, 23, 42, 0)';

  const commonStyle = {
    position: 'absolute',
    zIndex: 1,
    pointerEvents: 'none',
  };

  return (
    <>
      {/* Top edge fade */}
      <div
        style={{
          ...commonStyle,
          top: 0,
          left: 0,
          right: 0,
          height: `${fadeSize}px`,
          background: `linear-gradient(to bottom, ${edgeColor}, ${edgeColorTransparent})`,
        }}
      />
      {/* Bottom edge fade */}
      <div
        style={{
          ...commonStyle,
          bottom: 0,
          left: 0,
          right: 0,
          height: `${fadeSize}px`,
          background: `linear-gradient(to top, ${edgeColor}, ${edgeColorTransparent})`,
        }}
      />
      {/* Left edge fade */}
      <div
        style={{
          ...commonStyle,
          top: 0,
          bottom: 0,
          left: 0,
          width: `${fadeSize}px`,
          background: `linear-gradient(to right, ${edgeColor}, ${edgeColorTransparent})`,
        }}
      />
      {/* Right edge fade */}
      <div
        style={{
          ...commonStyle,
          top: 0,
          bottom: 0,
          right: 0,
          width: `${fadeSize}px`,
          background: `linear-gradient(to left, ${edgeColor}, ${edgeColorTransparent})`,
        }}
      />
    </>
  );
};

export default CampusBoundaryFocus;
