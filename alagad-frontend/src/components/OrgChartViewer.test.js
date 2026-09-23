import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import OrgChartViewer from './OrgChartViewer';

const chart = { data: 'data:image/png;base64,Y2hhcnQ=', mimeType: 'image/png' };

function setup() {
  render(<OrgChartViewer chart={chart} name="IT Office" />);
  const viewport = screen.getByRole('region', { name: 'IT Office chart viewer' });
  viewport.setPointerCapture = jest.fn();
  const document = screen.getByTestId('org-chart-document');
  return { viewport, document };
}

function pointer(target, type, id, x, y) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerId: id, button: 0, clientX: x, clientY: y });
  fireEvent(target, event);
}

test('zooms in and out with buttons and resets both zoom and position', () => {
  const { viewport, document } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('125%');
  fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
  fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
  expect(document.style.transform).toContain('scale(0.75)');
  fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
  fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
  expect(document.style.transform).toBe('translate(0px, 0px) scale(1)');
});

test('drags freely in both directions and stops after cancellation', () => {
  const { viewport, document } = setup();
  pointer(viewport, 'pointerdown', 1, 100, 100);
  pointer(viewport, 'pointermove', 1, 30, 160);
  expect(document.style.transform).toBe('translate(-70px, 60px) scale(1)');
  pointer(viewport, 'pointercancel', 1, 30, 160);
  pointer(viewport, 'pointermove', 1, 200, 200);
  expect(document.style.transform).toBe('translate(-70px, 60px) scale(1)');
  expect(viewport).not.toHaveClass('is-dragging');
});

test('pinches around the fingers and continues swiping after one finger lifts', () => {
  const { viewport, document } = setup();
  pointer(viewport, 'pointerdown', 1, 0, 0);
  pointer(viewport, 'pointerdown', 2, 100, 0);
  pointer(viewport, 'pointermove', 2, 200, 0);
  expect(document.style.transform).toBe('translate(0px, 0px) scale(2)');
  pointer(viewport, 'pointermove', 2, 50, 0);
  expect(document.style.transform).toBe('translate(0px, 0px) scale(0.5)');
  pointer(viewport, 'pointerup', 2, 50, 0);
  pointer(viewport, 'pointermove', 1, 30, 40);
  expect(document.style.transform).toBe('translate(30px, 40px) scale(0.5)');
});

test('wheel zoom stays anchored at the cursor and respects the zoom limits', () => {
  const { viewport, document } = setup();
  fireEvent.wheel(viewport, { deltaY: -Math.log(2) / 0.002, clientX: 100, clientY: 80 });
  expect(document.style.transform).toBe('translate(-100px, -80px) scale(2)');
  fireEvent.wheel(viewport, { deltaY: -10000 });
  expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  fireEvent.wheel(viewport, { deltaY: 10000 });
  expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
});
