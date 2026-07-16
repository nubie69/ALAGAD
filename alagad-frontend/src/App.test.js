import { render, screen } from '@testing-library/react';

// Provide a lightweight mock for the AuthContext used by <App />
jest.mock('./context/AuthContext', () => ({
  useAuth: () => ({ user: null, login: jest.fn(), logout: jest.fn(), loading: false }),
}));

jest.mock('./views/GuestView', () => () => <div>Guest View</div>);
jest.mock('./views/SuperAdminDashboard', () => () => <div>Super Admin Dashboard</div>);

import App from './App';

test('root renders the Admin / Super‑Admin login', () => {
  render(<App />);
  const heading = screen.getByRole('heading', { name: /admin \/ super\u2011admin sign in/i });
  expect(heading).toBeInTheDocument();
});

test('when served on localhost:3000 the top header/nav is hidden', () => {
  const originalLocation = window.location;
  // Replace location with a URL object that has port '3000'
  // (JSDOM's location is normally read-only - delete+reassign works in the test env)
  // eslint-disable-next-line no-delta
  // @ts-ignore - test shim
  delete window.location;
  // @ts-ignore
  window.location = new URL('http://localhost:3000');

  render(<App />);
  // <nav> maps to role 'navigation' — it should not be present on port 3000
  expect(screen.queryByRole('navigation')).toBeNull();

  // restore
  // @ts-ignore
  window.location = originalLocation;
});
