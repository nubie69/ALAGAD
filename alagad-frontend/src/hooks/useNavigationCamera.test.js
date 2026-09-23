import { act, renderHook } from '@testing-library/react';
import useNavigationCamera from './useNavigationCamera';

let frames;
let frameId;
beforeEach(() => {
  frames = new Map();
  frameId = 0;
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
});
afterEach(() => jest.restoreAllMocks());

const tick = (time) => act(() => {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(time));
});

function setup() {
  let view = {};
  const map = {
    stop: jest.fn(), getCenter: () => ({ lng: 125, lat: 8 }),
    getBearing: () => 350, getPitch: () => 0, getZoom: () => 17,
  };
  const props = {
    active: true, location: { lng: 125.01, lat: 8.01 }, heading: 10,
    mapRef: { current: { getMap: () => map } },
    setViewState: (update) => { view = update(view); },
  };
  const { rerender, unmount } = renderHook((options) => useNavigationCamera(options), { initialProps: props });
  return { rerender, unmount, props, map, view: () => view };
}

test('enters navigation gradually and rotates across north by the shortest turn', () => {
  const { view, map } = setup();
  tick(0);
  tick(700);
  expect(map.stop).toHaveBeenCalledTimes(1);
  expect(view().pitch).toBeCloseTo(26);
  expect(view().zoom).toBeCloseTo(17.6);
  expect(view().bearing).toBeCloseTo(360);
  for (let time = 716; time < 2400; time += 16) tick(time);
  expect(view().pitch).toBeCloseTo(52, 1);
});

test('updates GPS targets without restarting and cancels frames when navigation stops', () => {
  const { rerender, props, map, view } = setup();
  tick(0);
  tick(700);
  rerender({ ...props, location: { lng: 125.02, lat: 8.02 } });
  tick(716);
  expect(map.stop).toHaveBeenCalledTimes(1);
  expect(view().longitude).toBeGreaterThan(125.005);
  rerender({ ...props, active: false });
  expect(frames.size).toBe(0);
});

test('cancels the camera loop on unmount', () => {
  const { unmount } = setup();
  tick(0);
  unmount();
  expect(frames.size).toBe(0);
});
