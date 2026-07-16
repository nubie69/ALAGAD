Enhance the navigation bar in guest view with the following behavior:

Building & Room Assignment Check

When a guest selects a destination (room or office):

If the room/office is assigned to a building:

Automatically start navigation from current location to the assigned building.

Highlight the building on the map.

If the room/office is not assigned to a building, but a pin exists on the map:

Start navigation to the pin location instead.

Highlight the pin on the map.

Routing

Use the shortest, clear path along visible map lines.

Ensure the route updates in real time when the user moves.

Display a floating navigation bar at the top (small, mobile-friendly) showing:

Current destination

Distance or estimated time

Cancel button to stop navigation

Error Handling

If the room/office does not exist or no pin is present:

Show a clear error message: “Destination not available.”

Prevent any crashes or unresponsive UI on mobile or desktop.

Mobile & Desktop Compatibility

Mobile: route and bar should float without blocking map interactions.

Desktop: route overlay and navigation bar should integrate without compressing the map.

Implementation Notes

Use proper checks before navigation to prevent null/undefined errors.

Ensure map pins and buildings are clickable/selectable.

Navigation should dynamically handle both assigned and unassigned destinations without manual switching.

Expected Result

Guest can select a room/office or pin.

Navigation starts automatically:

To building if assigned

To pin if not assigned

UI is fully responsive and functional on both mobile and desktop.

No console errors or broken routes.