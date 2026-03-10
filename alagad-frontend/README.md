# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Google Maps API key (dev setup)

If the Guest View map is blank, the most common causes are a missing/invalid API key, HTTP referrer restrictions, or billing/API activation issues. Use the steps below to validate and fix your key quickly:

1) Add your key to a local env file:

   - Create `alagad-frontend/.env` and add:
     REACT_APP_GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE
   - Restart the dev server (`npm --prefix alagad-frontend start`).

2) If the key is present but the map still fails, test it from the browser (Dev tools → Console will show errors). The app includes a "Test key" button in Guest View (top-left diagnostics) that calls the Geocoding API and surfaces server error messages.

3) Quick fixes for common error messages:
   - RefererNotAllowedMapError: add `http://localhost:3000` and `http://localhost:3001` to the key's HTTP referrers in Google Cloud Console.
   - InvalidKeyMapError / MissingKeyMapError: ensure the key is correct and placed in `.env` as above.
   - BillingNotEnabled / API_NOT_ENABLED: enable billing and the Maps JavaScript API and Geocoding API for the project.

4) Server-side validation (works even if key is restricted by HTTP referrers):

   - Run the included script:
     ```bash
     node alagad-frontend/scripts/validate-maps-key.js <API_KEY>
     # or
     MAPS_API_KEY=<API_KEY> node alagad-frontend/scripts/validate-maps-key.js
     ```

5) Client-side tests (new)

   - The project includes unit tests for key UI flows (the Admin/Super‑Admin login flow is covered).
   - Run the frontend test suite once (recommended):
     ```bash
     npm --prefix alagad-frontend test -- --watchAll=false
     ```
   - To run only the AdminLogin tests use the test name filter:
     ```bash
     npm --prefix alagad-frontend test -- -t AdminLogin
     ```

6) If you want me to help configure the exact referrers or verify the key, paste the error shown in the Guest View diagnostics or the browser console and I'll provide the exact changes.

## Separate admin / super-admin localhost (dev)

You can run the admin and super-admin interfaces on separate localhost ports and have the public Guest View redirect to those hosts when appropriate.

- REACT_APP_HIDE_GUEST_LOGIN=true — hide login controls on the Guest View (root). Useful when guest is a public-only UI.
- REACT_APP_ADMIN_URL=http://localhost:3002 — when set, unauthenticated requests to `/admin` will redirect the browser to this origin (appended with `/admin`), allowing you to run the admin app on another dev server/port.
- REACT_APP_SUPERADMIN_URL=http://localhost:3003 — same as above but for `/super-admin`.

Example `.env` (alagad-frontend/.env):

```env
REACT_APP_GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE
REACT_APP_HIDE_GUEST_LOGIN=true
REACT_APP_ADMIN_URL=http://localhost:3002
REACT_APP_SUPERADMIN_URL=http://localhost:3003
```

Run admin/super-admin locally (recommended)

- Start the public guest instance (will hide login when `REACT_APP_HIDE_GUEST_LOGIN=true`):
  - PowerShell: $Env:PORT=3001; $Env:REACT_APP_HIDE_GUEST_LOGIN=true; npm --prefix alagad-frontend start
- Start an admin instance on port 3002 (separate window/tab):
  - PowerShell (recommended): $Env:PORT=3002; $Env:REACT_APP_HIDE_GUEST_LOGIN=false; npm --prefix alagad-frontend start
  - Or use the convenience script: npm --prefix alagad-frontend run start:admin
- Start a super-admin instance on port 3003 similarly (or: npm --prefix alagad-frontend run start:superadmin)

Troubleshooting — cannot access admin localhost

1. Is the admin dev server running?
   - Check running processes in PowerShell: Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, Path
   - Check ports in use: netstat -ano | findstr ":3002" (replace port as needed)
2. If the admin server is not running, start it with the commands above.
3. If the port is in use, pick a free port and update `REACT_APP_ADMIN_URL` in `.env`.
4. If the Guest View still doesn't redirect to the admin host:
   - Confirm `REACT_APP_ADMIN_URL` is set in `alagad-frontend/.env` and restart the guest dev server.
   - Make sure you're not authenticated in the Guest View (redirects only occur for unauthenticated users).
5. Browser caching / CORS: open DevTools → Network/Console to see errors and paste them into an issue or here.

If you'd like, I can start the admin instance for you now and report back whether it came up on http://localhost:3002/.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
