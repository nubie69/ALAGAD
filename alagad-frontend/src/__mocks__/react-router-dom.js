// Minimal manual mock for react-router-dom used by Jest tests
const React = require('react');

// A navigation mock that tests can override by jest.mock in specific suites
const mockNavigate = jest.fn();

module.exports = {
  __esModule: true,
  BrowserRouter: ({ children }) => React.createElement(React.Fragment, null, children),
  MemoryRouter: ({ children }) => React.createElement(React.Fragment, null, children),
  Router: ({ children }) => React.createElement(React.Fragment, null, children),
  Link: (props) => React.createElement('a', { ...props, href: props.to || '#' }, props.children),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/' }),
  // expose the mock so tests can assert or reset it if they import this module directly
  __mockNavigate: mockNavigate,
};
