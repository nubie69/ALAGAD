import React from 'react';

/**
 * BoxMarker
 * A clean, modern rectangular HTML marker that displays the building name.
 * Always stays horizontal (never rotates with the map).
 * Screen-size fixed (does not scale with map zoom).
 * Visible at ALL zoom levels.
 *
 * Props:
 *  name        – string  – text shown inside the box
 *  color       – string  – background hex color  (default '#3b82f6')
 *  isSelected  – bool    – shows selection ring   (default false)
 */
export const BoxMarker = ({
  name = '',
  color = '#3b82f6',
  isSelected = false,
}) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isMobile ? '3px' : '5px',
        backgroundColor: color,
        color: '#ffffff',
        fontWeight: 600,
        fontSize: isMobile ? '10px' : '12px',
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: isMobile ? '4px 8px' : '5px 12px',
        borderRadius: '6px',
        border: isSelected
          ? '2px solid rgba(255,255,255,0.95)'
          : '1px solid rgba(255,255,255,0.25)',
        boxShadow: isSelected
          ? `0 0 0 3px ${color}66, 0 4px 14px rgba(0,0,0,0.3)`
          : '0 2px 8px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
        whiteSpace: 'nowrap',
        textShadow: '0 1px 2px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        userSelect: 'none',
        letterSpacing: '0.3px',
        lineHeight: '1',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        maxWidth: isMobile ? '140px' : '200px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        backdropFilter: 'blur(2px)',
      }}
      title={name}
    >
      {name}
    </div>
  );
};

export default BoxMarker;
