import { useEffect, useRef } from 'react';

const shortestTurn = (from, to) => ((to - from + 540) % 360 + 360) % 360 - 180;

// Keep one camera transition alive while GPS and compass targets change.
export default function useNavigationCamera({ active, location, heading, mapRef, setViewState }) {
  const targetRef = useRef(null);
  const ready = Boolean(location);

  useEffect(() => {
    targetRef.current = location ? {
      longitude: location.lng,
      latitude: location.lat,
      bearing: Number.isFinite(heading) ? heading : 0,
    } : null;
  }, [location, heading]);

  useEffect(() => {
    if (!active || !ready) return undefined;
    const map = mapRef.current?.getMap();
    if (!map) return undefined;
    map.stop();
    const center = map.getCenter();
    let camera = {
      longitude: center.lng,
      latitude: center.lat,
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      zoom: map.getZoom(),
    };
    const initial = { ...camera };
    const zoom = Math.max(camera.zoom, 18.2);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame;
    let startedAt;
    let previousTime;

    const animate = (time) => {
      if (startedAt === undefined) startedAt = time;
      const target = { ...targetRef.current, pitch: 52, zoom };
      const elapsed = time - startedAt;
      const progress = reducedMotion ? 1 : Math.min(elapsed / 1400, 1);
      const entering = progress < 1;
      const amount = reducedMotion ? 1 : entering
        ? progress * progress * (3 - 2 * progress)
        : 1 - Math.exp(-Math.min(time - (previousTime ?? time), 64) / 180);
      const from = entering ? initial : camera;
      const next = {};
      for (const key of ['longitude', 'latitude', 'pitch', 'zoom']) {
        next[key] = from[key] + (target[key] - from[key]) * amount;
      }
      next.bearing = from.bearing + shortestTurn(from.bearing, target.bearing) * amount;
      const changed = Object.keys(next).some((key) => Math.abs(next[key] - camera[key]) > 0.0000001);
      camera = next;
      previousTime = time;
      if (changed) setViewState((current) => ({ ...current, ...next }));
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [active, ready, mapRef, setViewState]);
}
