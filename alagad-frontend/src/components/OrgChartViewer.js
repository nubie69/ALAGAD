import React, { useEffect, useRef, useState } from 'react';

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const clamp = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

export default function OrgChartViewer({ chart, name }) {
  const viewportRef = useRef(null);
  const pointers = useRef(new Map());
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const [view, setView] = useState(viewRef.current);
  const [dragging, setDragging] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const isPdf = chart.mimeType === 'application/pdf';

  useEffect(() => {
    if (!isPdf) return undefined;
    let active = true;
    let url;
    fetch(chart.data).then((response) => response.blob()).then((blob) => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPdfUrl(url);
    }).catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [chart.data, isPdf]);

  const updateView = (next) => {
    viewRef.current = next;
    setView(next);
  };

  const zoomAt = (scale, point, previousPoint = point) => {
    const current = viewRef.current;
    const nextScale = clamp(scale);
    const ratio = nextScale / current.scale;
    updateView({
      scale: nextScale,
      x: point.x - (previousPoint.x - current.x) * ratio,
      y: point.y - (previousPoint.y - current.y) * ratio,
    });
  };

  const center = () => ({
    x: (viewportRef.current?.clientWidth || 0) / 2,
    y: (viewportRef.current?.clientHeight || 0) / 2,
  });

  // A native listener must be non-passive to keep wheel/pinch zoom inside the chart.
  useEffect(() => {
    const viewport = viewportRef.current;
    const handleWheel = (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      zoomAt(viewRef.current.scale * Math.exp(-event.deltaY * unit * 0.002), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
    // The listener reads current gesture state from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointFor = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, pointFor(event));
    setDragging(true);
  };
  const onPointerMove = (event) => {
    if (!pointers.current.has(event.pointerId)) return;
    const before = [...pointers.current.values()];
    const previous = pointers.current.get(event.pointerId);
    const point = pointFor(event);
    pointers.current.set(event.pointerId, point);
    const after = [...pointers.current.values()];
    if (after.length === 1) {
      const current = viewRef.current;
      updateView({ ...current, x: current.x + point.x - previous.x, y: current.y + point.y - previous.y });
    } else {
      const midpoint = (points) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
      const distance = (points) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const oldDistance = distance(before);
      if (oldDistance > 0) zoomAt(viewRef.current.scale * distance(after) / oldDistance, midpoint(after), midpoint(before));
    }
  };
  const endPointer = (event) => {
    pointers.current.delete(event.pointerId);
    setDragging(pointers.current.size > 0);
  };
  const reset = () => updateView({ x: 0, y: 0, scale: 1 });

  return (
    <>
      <div className="public-org-viewer-toolbar">
        <span>Drag or swipe to move. Pinch or scroll to zoom.</span>
        <div className="public-org-zoom" aria-label="Chart zoom controls">
          <button type="button" onClick={() => zoomAt(viewRef.current.scale - 0.25, center())} disabled={view.scale <= MIN_SCALE} aria-label="Zoom out">−</button>
          <button type="button" className="public-org-zoom-value" onClick={reset} aria-label="Reset zoom">{Math.round(view.scale * 100)}%</button>
          <button type="button" onClick={() => zoomAt(viewRef.current.scale + 0.25, center())} disabled={view.scale >= MAX_SCALE} aria-label="Zoom in">+</button>
        </div>
        {isPdf && pdfUrl && <a href={pdfUrl} target="_blank" rel="noopener noreferrer">Open full PDF</a>}
      </div>
      <div
        ref={viewportRef}
        className={`public-org-chart-viewport${dragging ? ' is-dragging' : ''}`}
        role="region"
        aria-label={`${name} chart viewer`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
        onKeyDown={(event) => {
          const steps = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
          const step = steps[event.key];
          if (step) {
            event.preventDefault();
            updateView({ ...viewRef.current, x: viewRef.current.x + step[0], y: viewRef.current.y + step[1] });
          } else if (['+', '=', '-', '0', 'Home'].includes(event.key)) {
            event.preventDefault();
            if (event.key === '0' || event.key === 'Home') reset();
            else zoomAt(viewRef.current.scale + (event.key === '-' ? -0.25 : 0.25), center());
          }
        }}
      >
        <div className="public-org-chart-document" data-testid="org-chart-document" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          {isPdf ? (
            <object data={chart.data} type="application/pdf" tabIndex={-1} aria-label={`${name} organizational chart`}>
              <p>This PDF cannot be previewed here. Use Open full PDF to view it.</p>
            </object>
          ) : <img src={chart.data} alt={`${name} organizational chart`} draggable="false" />}
        </div>
      </div>
    </>
  );
}
