# Mobile Navigation Testing Guide

This guide is for testing Mapbox navigation behavior on a phone before deployment.

## 1. Start local development servers

From the project root:

```bash
npm run start:mobile:lan
```

This starts:
- Frontend guest app on port `3000`
- Backend API on port `3001`

## 2. Test over local Wi-Fi (same network)

1. Connect your phone and computer to the same Wi-Fi.
2. Find your computer LAN IP (for example `192.168.1.10`).
3. Open this URL on your phone:
   - `http://<YOUR_LAN_IP>:3000`

Note:
- Local HTTP is useful for layout and route logic checks.
- Many mobile browsers require HTTPS for live GPS and orientation sensor access.

## 3. Test with HTTPS using ngrok (recommended for real GPS)

1. Keep servers running.
2. Start tunnels from project root:

```bash
npm run tunnel:all
```

3. Copy both generated HTTPS URLs:
- Frontend tunnel (port 3000)
- Backend tunnel (port 3001)

4. Create/update `alagad-frontend/.env.local` and set backend API URL to the backend tunnel URL:

```env
REACT_APP_API_URL=https://<YOUR_BACKEND_NGROK_URL>/api
```

5. Restart frontend after changing env vars.
6. Open frontend HTTPS ngrok URL on your phone.

## 4. GPS and permission behavior in app

Implemented behavior:
- Uses high-accuracy geolocation watch:
  - `navigator.geolocation.watchPosition(..., { enableHighAccuracy: true })`
- Requests permission via browser prompt.
- Handles denied/weak signal errors with clear messages.
- On mobile insecure origins, app warns that HTTPS is required for GPS.

## 5. Arrow indicator and heading behavior

Implemented behavior:
- Custom arrow marker (replaces default marker).
- Arrow rotates with device orientation heading.
- If heading sensors are unavailable, falls back to geolocation heading/movement heading.
- In navigation mode, heading can snap to route direction for stable guidance.

## 6. Walkable path retraction

Implemented behavior:
- Draws polyline route from current location to destination.
- On every location update, computes route progress and retracts traversed segment.
- Keeps only remaining route visible with smoothed position updates.

## 7. Structured debug logs

The app emits structured navigation telemetry in console and `window.__ALAGAD_NAV_STATE__`:

```json
{
  "latitude": 8.482,
  "longitude": 124.647,
  "heading": 45,
  "navigation_active": true,
  "remaining_path": [[8.482,124.647],[8.483,124.648],[8.484,124.649]]
}
```

## 8. Simulate movement when GPS is weak indoors

Chrome DevTools:
1. Open DevTools.
2. Open Sensors panel.
3. Set Location to custom coordinates.
4. Change coordinates gradually to simulate walking.

This is useful for testing:
- Route retraction updates.
- Arrow rotation updates.
- Navigation summary changes.

## 9. Autosuggestion behavior

Configured behavior:
- Destination autosuggestions are single-result closest match only.
- Multi-option "Did you mean" style lists are suppressed in deterministic route handling.

## 10. Quick validation checklist

- Mobile can load app from LAN URL.
- Mobile can load app from HTTPS ngrok URL.
- Location permission prompt appears.
- Live location updates appear on map.
- Arrow rotates with heading.
- Route retracts while moving/simulating movement.
- Navigation bar shows destination and distance/time.
- Cancel navigation button stops route.
- Destination without valid pin/building shows: `Destination not available.`
