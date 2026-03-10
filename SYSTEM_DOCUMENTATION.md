# ALAGAD - Campus Navigation System
## Complete System Documentation

---

## 1. SYSTEM OVERVIEW

**ALAGAD** is a web-based interactive campus navigation system built for **Bukidnon State University (BukSU)**, Malaybalay, Bukidnon. It provides real-time campus mapping, AI-powered chatbot assistance, walking directions via A* pathfinding, and a full admin dashboard for managing campus data.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, React Router, Mapbox GL JS, Framer Motion, Turf.js, Tailwind CSS |
| **Backend** | Node.js, Express.js, MongoDB, Mongoose ODM |
| **Authentication** | JWT (JSON Web Tokens), bcrypt password hashing |
| **AI Chatbot** | OpenAI GPT-3.5-turbo |
| **Voice Input** | Web Speech Recognition API |
| **Maps** | Mapbox GL with custom campus style |

### System Architecture

```
┌──────────────────────────────────────────────────┐
│                    FRONTEND                       │
│  React App (Port 3000)                           │
│  ┌────────────┐ ┌────────────┐ ┌──────────────┐ │
│  │ GuestView  │ │ SuperAdmin │ │ LandingPage  │ │
│  │ (Map +     │ │ Dashboard  │ │              │ │
│  │  ChatBot)  │ │            │ │              │ │
│  └────────────┘ └────────────┘ └──────────────┘ │
│         │              │                         │
│  ┌──────┴──────────────┴──────────────────────┐  │
│  │          API Layer (utils/api.js)          │  │
│  └────────────────────┬───────────────────────┘  │
└───────────────────────┼──────────────────────────┘
                        │ HTTP/REST
┌───────────────────────┼──────────────────────────┐
│                    BACKEND                        │
│  Express Server (Port 3001)                      │
│  ┌────────────────────┴───────────────────────┐  │
│  │              Route Handlers                │  │
│  │  /users /buildings /rooms /offices /chat   │  │
│  │  /faculty /services /departments /map      │  │
│  │  /settings /overview                       │  │
│  └────────────────────┬───────────────────────┘  │
│  ┌────────────────────┴───────────────────────┐  │
│  │           Mongoose Models (MongoDB)        │  │
│  │  User, Building, Room, Office, Faculty,    │  │
│  │  Service, Department, Settings             │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## 2. BACKEND (alagad-backend/)

### 2.1 Server Entry Point — `server.js`

**Purpose**: Main Express application that connects to MongoDB and registers all API routes.

**Key Functions**:
- Connects to MongoDB using `MONGO_URI` environment variable
- Configures CORS (Cross-Origin Resource Sharing) for frontend access
- Parses JSON request bodies (10MB limit for image uploads)
- Registers all `/api/` route handlers
- Starts HTTP server on port 3001

**Registered Routes**:
| Route Prefix | Handler File | Purpose |
|---|---|---|
| `/api/users` | userRoutes.js | Authentication & user management |
| `/api/buildings` | buildingRoutes.js | Building CRUD operations |
| `/api/rooms` | roomRoutes.js | Room CRUD operations |
| `/api/offices` | officeRoutes.js | Office CRUD operations |
| `/api/faculty` | facultyRoutes.js | Faculty/staff management |
| `/api/services` | serviceRoutes.js | Campus services |
| `/api/departments` | departmentRoutes.js | Department management |
| `/api/settings` | settingsRoutes.js | System settings |
| `/api/overview` | overviewRoutes.js | Dashboard statistics |
| `/api/map` | mapRoutes.js | Map features/pins |
| `/api/chat` | chatbotRoutes.js | AI chatbot |

---

### 2.2 Authentication — `middleware/authMiddleware.js`

**Purpose**: Protects API routes with JWT-based authorization.

**Functions**:

| Function | Description |
|----------|-------------|
| `protect()` | Middleware that extracts the JWT from the `Authorization: Bearer <token>` header, verifies it against `JWT_SECRET`, and attaches the user object to `req.user`. Returns 401 if token is missing or invalid. |
| `authorize(...roles)` | Middleware that checks if `req.user.role` matches one of the allowed roles (e.g., `'super_admin'`). Returns 403 if unauthorized. |

**Authentication Flow**:
1. User logs in → server returns JWT token
2. Frontend stores token in `localStorage`
3. Every protected API call includes `Authorization: Bearer <token>` header
4. `protect()` middleware verifies token and loads user from DB
5. `authorize('super_admin')` restricts admin-only endpoints

---

### 2.3 Data Models (Mongoose Schemas)

#### User Model — `models/User.js`
Stores registered users (admins and guests).

| Field | Type | Description |
|-------|------|-------------|
| `name` | String (required) | User's display name |
| `email` | String (required, unique) | Login email |
| `password` | String (hashed) | bcrypt-hashed password |
| `role` | Enum: `'guest'` \| `'super_admin'` | Access level (default: guest) |
| `department` | String | Optional department affiliation |
| `office` | ObjectId → Office | Optional office assignment |
| `permissions` | Object | Granular permissions: `canManageBuildings`, `canManageRooms`, `canManageOffices`, `canManageStaff`, `canManageServices`, `canEditMap` |

**Methods**: `matchPassword(enteredPassword)` — compares plaintext against bcrypt hash.
**Pre-save Hook**: Automatically hashes password with bcrypt (salt rounds: 10) before saving.

#### Building Model — `models/Building.js`
Represents physical campus buildings.

| Field | Type | Description |
|-------|------|-------------|
| `name` | String (required, unique) | Building name |
| `description` | String | Building description |
| `image` | String | Base64 or URL of building photo |
| `numberOfFloors` | Number | Floor count |
| `department` | String | Primary department housed |
| `geometry` | GeoJSON (Point/Polygon) | Map coordinates for marker placement |
| `markerColor` | String | Hex color for map pin (default: `#3b82f6`) |
| `rotation` | Number | Pin rotation angle on map |
| `isActive` | Boolean | Soft-delete flag (default: true) |

#### Room Model — `models/Room.js`
Represents rooms inside buildings.

| Field | Type | Description |
|-------|------|-------------|
| `name` | String (required, unique) | Room name/number |
| `building` | ObjectId → Building | Parent building reference |
| `floor` | Number | Floor number |
| `description` | String | Room description |
| `department` | String (required) | Department that uses this room |
| `isActive` | Boolean | Soft-delete flag |

#### Office Model — `models/Office.js`
Represents administrative/faculty offices.

| Field | Type | Description |
|-------|------|-------------|
| `name` | String (required, unique) | Office name |
| `building` | ObjectId → Building | Building location |
| `room` | ObjectId → Room | Specific room |
| `floor` | Number | Floor number |
| `contactInfo` | String | Phone/email |
| `description` | String | Office description |
| `services` | [ObjectId → Service] | Services offered |
| `department` | String (required) | Department affiliation |
| `geometry` | GeoJSON | Map coordinates (separate pin from building) |
| `markerColor` | String | Pin color (default: `#8b5cf6` purple) |
| `isActive` | Boolean | Soft-delete flag |

#### FacultyStaff Model — `models/FacultyStaff.js`
Represents university faculty and staff members.

| Field | Type | Description |
|-------|------|-------------|
| `name` | String (required) | Full name |
| `office` | ObjectId → Office | Office assignment |
| `department` | String | Department assignment |
| `title` | String | Position/title |
| `contactInfo` | String | Contact details |
| `isActive` | Boolean | Soft-delete flag |

**Validation**: Must have either `office` or `department` assigned.

#### Service Model — `models/Service.js`
Represents services offered by offices/departments.

| Field | Type | Description |
|-------|------|-------------|
| `name` | String (required, unique) | Service name |
| `description` | String | What the service provides |
| `department` | String | Department offering service |
| `office` | ObjectId → Office | Office offering service |
| `isActive` | Boolean | Soft-delete flag |

#### Department Model — `models/Department.js`
Represents academic and administrative departments.

| Field | Type | Description |
|-------|------|-------------|
| `name` | String (required, unique) | Department name |
| `code` | String | Short code (e.g., "IT") |
| `description` | String | Department description |
| `building` | ObjectId → Building | Primary building |
| `floor` | Number | Floor location |
| `active` | Boolean | Active status |

#### Settings Model — `models/Settings.js`
Singleton document for system-wide configuration.

| Field | Type | Description |
|-------|------|-------------|
| `maintenanceMode` | Boolean | When true, shows maintenance screen to guests |
| `kioskStatus` | Enum: `'online'` \| `'offline'` \| `'maintenance'` | System availability status |

---

### 2.4 API Endpoints (Route Handlers)

#### User Routes — `routes/userRoutes.js`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/users/login` | Public | Authenticate with email/password → returns JWT token |
| POST | `/api/users` | Super Admin | Register new user account |
| GET | `/api/users/me` | Protected | Get current user's profile |
| POST | `/api/users/change-password` | Protected | Update password (requires current password) |

#### Building Routes — `routes/buildingRoutes.js`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/buildings` | Public | Get all active buildings |
| GET | `/api/buildings/:id` | Public | Get single building by ID |
| POST | `/api/buildings` | Super Admin | Create new building |
| PUT | `/api/buildings/:id` | Super Admin | Update building |
| DELETE | `/api/buildings/:id` | Super Admin | Soft-delete (deactivate) building |
| PUT | `/api/buildings/:id/reactivate` | Super Admin | Reactivate a deactivated building |
| POST | `/api/buildings/:id/image` | Super Admin | Upload building image (base64) |
| DELETE | `/api/buildings/:id/image` | Super Admin | Remove building image |

#### Room Routes — `routes/roomRoutes.js`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/rooms` | Public | Get all rooms (populated with building) |
| GET | `/api/rooms/building/:buildingId` | Public | Get rooms in a specific building |
| POST | `/api/rooms` | Super Admin | Create new room |
| PUT | `/api/rooms/:id` | Super Admin | Update room |
| DELETE | `/api/rooms/:id` | Super Admin | Delete room |

#### Office Routes — `routes/officeRoutes.js`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/offices` | Public | Get all offices (populated: building, room, services) |
| POST | `/api/offices` | Super Admin | Create new office |
| PUT | `/api/offices/:id` | Super Admin | Update office |
| DELETE | `/api/offices/:id` | Super Admin | Delete office |

#### Faculty Routes — `routes/facultyRoutes.js`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/faculty` | Public | Get all faculty/staff |
| GET | `/api/faculty/office/:officeId` | Public | Get faculty by office |
| POST | `/api/faculty` | Super Admin | Create faculty (requires office or department) |
| PUT | `/api/faculty/:id` | Super Admin | Update faculty |
| DELETE | `/api/faculty/:id` | Super Admin | Delete faculty |

#### Department Routes — `routes/departmentRoutes.js`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/departments` | Public | Get all departments (auto-seeds 5 defaults if empty) |
| POST | `/api/departments` | Super Admin | Create department |
| PUT | `/api/departments/:id` | Super Admin | Update department |
| DELETE | `/api/departments/:id` | Super Admin | Delete department |

**Auto-seeded Defaults**: IT Department, Academic Affairs, Administration, Facilities Management, Campus Security

#### Service Routes — `routes/serviceRoutes.js`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/services` | Public | Get all services |
| POST | `/api/services` | Super Admin | Create service |
| PUT | `/api/services/:id` | Super Admin | Update service |
| DELETE | `/api/services/:id` | Super Admin | Delete service |

#### Settings Routes — `routes/settingsRoutes.js`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/settings/status` | Public | Get public system status (maintenance/kiosk) |
| GET | `/api/settings` | Super Admin | Get full settings object |
| PUT | `/api/settings` | Super Admin | Update settings |

#### Overview Routes — `routes/overviewRoutes.js`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/overview` | Super Admin | Dashboard statistics: counts of all entities, kiosk status, maintenance mode, top buildings by rooms |

#### Map Routes — `routes/mapRoutes.js`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/map/features` | Public | Get all map features as GeoJSON FeatureCollection |
| POST | `/api/map/features` | Super Admin | Save/update a map feature |
| POST | `/api/map/features/new` | Super Admin | Create new map feature |
| DELETE | `/api/map/features/:id` | Super Admin | Delete map feature |
| PUT | `/api/map/features/:id/pin` | Super Admin | Set geometry/pin for a building or office |
| DELETE | `/api/map/features/:id/pin` | Super Admin | Remove pin from building/office |

#### Chatbot Routes — `routes/chatbotRoutes.js`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/chat` | Public | Send message to AI chatbot |

**Chatbot Function**:
1. Receives user message and language preference (en/tl/ceb)
2. Fetches all campus data (buildings, offices, services, faculty) from DB
3. Constructs a system prompt with full campus context
4. Sends to OpenAI GPT-3.5-turbo API
5. Returns AI response text with timestamp
6. Supports multilingual replies: English, Tagalog, Cebuano

---

### 2.5 Utility Scripts

| Script | Purpose |
|--------|---------|
| `populate-database.js` | Seeds initial data: admin user, 3 sample buildings, 3 sample offices |
| `scripts/seedAdmin.js` | Creates super_admin user (buksu.alagad@gmail.com / Admin001) |
| `scripts/backfillDepartmentBuildings.js` | Maps departments to buildings based on keyword matching |
| `scripts/checkDepartments.js` | Diagnostic: displays all departments and building associations |
| `scripts/checkServices.js` | Diagnostic: lists all services with office/building references |
| `scripts/cleanupMapFeatures.js` | Validates GeoJSON geometry and removes invalid features |

---

## 3. FRONTEND (alagad-frontend/)

### 3.1 Application Entry & Routing — `App.js`

**Purpose**: Root component that sets up React Router and wraps the app with AuthProvider.

**Routes**:
| Path | Component | Description |
|------|-----------|-------------|
| `/` | LandingPage | Welcome page with navigation portals |
| `/guest` | GuestView | Public interactive campus map |
| `/super-admin-login-form` | SuperAdminLoginForm | Admin login page |
| `/super-admin` | SuperAdminDashboard | Admin control panel (protected) |

**Environment Feature Flags**:
- `REACT_APP_MODE` — `'guest'` (guest-only), `'admin'` (admin-only), or `'all'` (both)
- `REACT_APP_HIDE_GUEST_LOGIN` — hides login controls from guest view
- `REACT_APP_SUPERADMIN_URL` — separate host for admin (redirects instead of routing)

---

### 3.2 Context Providers

#### AuthContext — `context/AuthContext.js`
**Purpose**: Manages user authentication state across the app.

**State**:
| Variable | Type | Description |
|----------|------|-------------|
| `user` | Object \| null | Current logged-in user (`_id`, `name`, `email`, `role`) |
| `loading` | Boolean | True while checking stored token on mount |

**Functions**:
| Function | Description |
|----------|-------------|
| `login(email, password)` | Calls `POST /api/users/login`, stores JWT in localStorage, sets user state |
| `logout()` | Clears token from localStorage, resets user to null, redirects to login |
| `register(name, email, password, role)` | Creates user account and auto-logs in |

**Hook**: `useAuth()` — access `user`, `login`, `logout`, `register`, `loading`

#### MapContext — `context/MapContext.js`
**Purpose**: Manages map state, user geolocation, and map feature CRUD.

**State**:
| Variable | Type | Description |
|----------|------|-------------|
| `mapCenter` | {lat, lng} | Map center point (default: BukSU campus 8.1564, 125.1247) |
| `mapZoom` | Number | Current zoom level |
| `mapFeatures` | GeoJSON | Map feature collection from backend |
| `userLocation` | {lat, lng} \| null | User's current GPS position |
| `locationError` | String \| null | Geolocation error message |

**Functions**:
| Function | Description |
|----------|-------------|
| `fetchMapFeatures()` | GET all map features from `/api/map/features` |
| `addMapFeature(feature)` | POST new feature to backend |
| `updateMapFeature(id, data)` | PUT update existing feature |
| `deleteMapFeature(id)` | DELETE feature from backend |

**Hook**: `useMapState()` — access all map state and functions

---

### 3.3 View Pages

#### LandingPage — `views/LandingPage.js`
**Purpose**: Public welcome page that introduces the system and provides navigation.

**Sections**:
1. **Hero** — ALAGAD logo, campus image, tagline
2. **Portal Cards** — Clickable cards navigating to:
   - "Public Map View" → `/guest`
   - "Admin Dashboard" → `/super-admin-login-form`
3. **Key Features** — Interactive Map, Search & Directions, AI Assistant descriptions
4. **Footer** — Copyright and university credit

---

#### GuestView — `views/GuestView.js`
**Purpose**: The main interactive campus map view for public users. This is the core feature of the system.

**Key State Variables**:
| Variable | Purpose |
|----------|---------|
| `viewState` | Mapbox camera (lat, lng, zoom, pitch, bearing) |
| `buildings`, `rooms`, `offices`, `faculty` | Loaded campus data arrays |
| `isQuickNavOpen`, `quickNavBuilding` | Controls the building details panel |
| `selectedItemId`, `selectedItemType` | Currently selected map item |
| `isNavigating`, `navigationRoute`, `navigationTarget` | Walking route state |
| `userLocation`, `heading` | User's GPS position and compass heading |
| `sidebarQuery` | Search text filter for sidebar |
| `sheetSnap` | Mobile bottom sheet position: `'peek'`, `'half'`, `'full'` |
| `isSidebarOpen` | Desktop sidebar visibility toggle |

**Key Functions**:
| Function | Description |
|----------|-------------|
| `handleSidebarNavigate(entity, type, fallback)` | When user clicks a room/office in sidebar — enriches the parent building with its rooms and offices, opens the quick nav details panel, flies the map camera to the building location |
| `startNavigation(building, targetName)` | Initiates A* pathfinding from user's location to building. Finds the nearest campus graph node, runs the route algorithm, generates GeoJSON route line, calculates walk time and distance |
| `stopNavigation()` | Clears route, resets navigation state |
| `flyToLocation(lat, lng)` | Smoothly animates map camera to coordinates (zoom 18.5, pitch 45°) |
| `resetToOverview()` | Resets map to default BukSU campus overview position |
| `onMapLoad()` | Called when Mapbox finishes loading — fetches map features, sets style loaded flag |

**Map Layers Rendered**:
1. **Campus Boundary Mask** — Dark overlay outside campus (black at 50% opacity)
2. **Walkable Routes** — Gray dashed lines showing all campus paths
3. **User Location** — Pulsing blue dot with heading indicator
4. **Building Markers** — Color-coded BoxMarker pins on each building
5. **Office Markers** — Purple BoxMarker pins for standalone offices
6. **Navigation Route** — Blue animated line showing walking directions
7. **Destination Pin** — Red pulsating marker at navigation target

**Sidebar / Bottom Sheet Content**:
- **Search bar** — Filters rooms and offices by name in real-time
- **Rooms section** — Collapsible list of all rooms with building name, type, floor, capacity
- **Offices section** — Collapsible list of all offices with building, department, floor, head

**Quick Nav Details Panel** (shown when a building/pin is clicked):
- Hero image of the building
- Building name + "Navigate" button (starts walking directions)
- Meta: floor count, department
- Description text
- **Building Directory**: Floor tabs showing offices and rooms per floor

---

#### SuperAdminLoginForm — `views/SuperAdminLoginForm.js`
**Purpose**: Login gate for the admin dashboard.

**Flow**: Email + Password form → calls `login()` from AuthContext → verifies role is `super_admin` → redirects to `/super-admin`

---

#### SuperAdminDashboard — `views/SuperAdminDashboard.js`
**Purpose**: Full administrative control panel for managing all campus data.

**Tabs**:
| Tab | Function |
|-----|----------|
| **Dashboard** | Overview stats: total counts of buildings, rooms, offices, faculty, services, departments. Shows kiosk status and maintenance mode. |
| **Buildings** | List, search, create, edit, delete, reactivate buildings. Upload building images. |
| **Rooms** | Manage rooms with building assignment, floor number, department. |
| **Offices** | Manage offices with building/room/service links, contact info. |
| **Faculty** | Manage faculty/staff with office or department assignment. |
| **Services** | Manage campus services with descriptions. |
| **Departments** | Manage academic/administrative departments. |
| **Map Editor** | Visual pin placement: click buildings/offices, click map to set location, adjust rotation/color. |
| **Settings** | Toggle maintenance mode, kiosk status, change admin password. |

**Common Features Across Tabs**:
- Search/filter functionality
- Active/inactive status filter
- Department filter
- Inline create forms
- Edit modals with form validation
- Success/error notification toasts

---

### 3.4 Components

#### ChatBot — `components/ChatBot.js`
**Purpose**: Floating AI assistant widget available on the guest map view.

**Features**:
- **Multi-language support**: English, Tagalog (Filipino), Cebuano — switchable with language buttons
- **Text input**: Type questions about campus buildings, directions, services
- **Voice input**: Hold-to-talk speech recognition (Web Speech API)
- **Typewriter effect**: AI responses displayed character by character
- **Message history**: Scrollable chat with user/bot message bubbles
- **Greeting message**: Contextual welcome when chat opens
- **Framer Motion animations**: Smooth slide-in/out overlay transitions
- **3D Mascot**: Glossy red chatbot icon as the floating trigger button

**How It Works**:
1. User types or speaks a question
2. Message sent to `POST /api/chat` with language preference
3. Backend fetches all campus data, constructs context for GPT
4. OpenAI returns response in selected language
5. Response displayed with typewriter animation

#### BuildingMarkers — `components/BuildingMarkers.js`
**Purpose**: Renders all building pins on the Mapbox map.

**Color Coding**:
| Building Type | Color |
|--------------|-------|
| Administrative | Purple |
| Library, Gym, Cafeteria | Green |
| Dormitory | Orange |
| Default (Academic) | Blue |

**Features**: Click pin → show popup → "View Details" opens Quick Nav panel

#### BoxMarker — `components/BoxMarker.js`
**Purpose**: Styled pin component for map markers.
- Displays building/office name in a colored box
- Customizable color and rotation
- Mobile-aware sizing (smaller on mobile devices)

#### MapEditor — `components/MapEditor.js`
**Purpose**: Admin tool for visual map pin management.

**Features**:
- Two tabs: Buildings and Offices
- Search/filter items
- Click item → select for editing
- Click map → place/move pin
- Edit rotation, color, name, description inline
- Save changes to backend API

#### QuickNavPanel — `components/QuickNavPanel.js`
**Purpose**: Slide-out panel showing detailed building information.

**Content**: Building image, location, floor count, description, rooms list, offices list, departments.

#### SafeGeoJSON — `components/SafeGeoJSON.js`
**Purpose**: Safely renders GeoJSON features on the map with error handling for invalid geometries.

#### CampusBoundaryFocus — `components/CampusBoundaryFocus.js`
**Purpose**: Constrains map view to campus boundaries.

#### WalkableRoutes — `components/WalkableRoutes.js`
**Purpose**: Renders walkable path lines on the map from GeoJSON data.

#### MapComponent — `components/MapComponent.js`
**Purpose**: Reusable map display used in the admin dashboard's map editor tab.

---

### 3.5 Utility Functions

#### api.js — `utils/api.js`
**Purpose**: Centralized API client for all backend communication.

**API Groups**:
| Group | Functions |
|-------|-----------|
| `authAPI` | `login()`, `getCurrentUser()`, `logout()`, `changePassword()` |
| `buildingsAPI` | `getAll()`, `getById()`, `create()`, `update()`, `delete()`, `reactivate()`, `uploadImage()`, `deleteImage()` |
| `roomsAPI` | `getAll()`, `getByBuilding()`, `getByDepartment()`, `create()`, `update()`, `delete()` |
| `officesAPI` | `getAll()`, `create()`, `update()`, `delete()` |
| `facultyAPI` | `getAll()`, `getByOffice()`, `create()`, `update()`, `delete()` |
| `servicesAPI` | `getAll()`, `create()`, `update()`, `delete()` |
| `departmentsAPI` | `getAll()`, `create()`, `update()`, `delete()` |
| `mapAPI` | `getFeatures()`, `saveFeature()`, `createFeature()`, `deleteFeature()`, `setPin()`, `removePin()` |
| `settingsAPI` | `getStatus()`, `get()`, `update()` |
| `overviewAPI` | `get()` |
| `chatAPI` | `send(message, language)` |

**Base URL Logic**: Automatically replaces `localhost` with current network IP for LAN access.

#### campusPathfinding.js — `utils/campusPathfinding.js`
**Purpose**: A* pathfinding algorithm for campus walking directions.

**Functions**:
| Function | Description |
|----------|-------------|
| `findCampusRoute(start, end)` | Runs A* search on the walkable paths graph. Returns GeoJSON route line, total distance (meters), estimated walk time (seconds at 1.2 m/s), and step-by-step coordinates. |
| `isInsideCampus(point)` | Checks if a GPS coordinate is within the campus boundary polygon. |
| `nearestPointOnCampus(point)` | Snaps a GPS point to the nearest node in the walkable paths graph. |
| `getWalkablePathsGeoJSON()` | Returns GeoJSON FeatureCollection of all walkable path segments (for map visualization). |

**Algorithm**: A* with Turf.js geographic distance as heuristic. Graph built from pre-defined walkable routes in `data/walkableRoutes.json` (~60+ path segments).

#### icons.js — `utils/icons.js`
**Purpose**: Re-exports Heroicons as consistently-sized React components.

**Exported Icons**: EditIcon, DeleteIcon, DashboardIcon, BuildingIcon, FacultyIcon, SettingsIcon, MapPinIconOutline, MapIconOutline, AdminIcon, DepartmentIcon, LogoutIcon, BackIcon, CloseIcon, MicIcon, StopMicIcon, ListeningIcon, SendIcon, ChatIcon, StaffIcon, RoomIcon, OfficeIcon, ServiceIcon

#### translations.js — `utils/translations.js`
**Purpose**: Multilingual string dictionary for the chatbot and UI labels.

**Supported Languages**: English (`en`), Cebuano (`ceb`), Tagalog (`tl`)

Contains hundreds of translated strings for campus navigation terms, chatbot messages, and UI elements.

#### mapBoundaries.js — `utils/mapBoundaries.js`
**Purpose**: Defines campus boundary polygon coordinates used for map constraints and the outside-boundary dark overlay.

#### mapboxDirections.js — `utils/mapboxDirections.js`
**Purpose**: Helper for Mapbox Directions API integration (alternate routing method).

---

### 3.6 Custom Hooks

#### useVoiceRecognition — `hooks/useVoiceRecognition.js`
**Purpose**: Wraps the browser's Web Speech Recognition API for voice search input.

**State**:
| Variable | Description |
|----------|-------------|
| `isListening` | True when microphone is actively capturing |
| `isSupported` | True if browser supports speech recognition |
| `error` | Error message if recognition fails |

**Functions**:
| Function | Description |
|----------|-------------|
| `startListening()` | Begins speech capture |
| `stopListening()` | Ends capture |
| `setLanguage(code)` | Changes recognition language (en-US, fil-PH, ceb) |

**Configuration**: `continuous: false`, `interimResults: false` — captures full utterance before returning result.

---

### 3.7 Data Files

#### walkableRoutes.json — `data/walkableRoutes.json`
**Purpose**: Pre-defined GeoJSON FeatureCollection of ~60+ LineString features representing walkable campus paths.

**Usage**: Loaded by `campusPathfinding.js` to build the A* graph. Also visualized on the map as gray dashed lines.

---

## 4. KEY USER FLOWS

### 4.1 Guest — Finding a Building
1. User opens `/guest` → GuestView loads with interactive map
2. User sees building pins on the map (colored BoxMarkers)
3. User taps a building pin → popup appears with building name
4. User taps "View Details" → Quick Nav panel slides in with full building info
5. Building Directory shows floors with offices and rooms per floor

### 4.2 Guest — Getting Walking Directions
1. User opens Quick Nav panel for a building
2. User taps "Navigate" button
3. System gets user's GPS location
4. A* pathfinding runs from user location to building
5. Blue animated route line displays on map
6. Walk time and distance shown

### 4.3 Guest — Using the AI Chatbot
1. User taps the red chatbot mascot icon (bottom-right corner)
2. Chat overlay opens with greeting message
3. User types or hold-to-speak a question (e.g., "Where is the library?")
4. System sends message + all campus data to OpenAI
5. AI responds in selected language with campus-specific answer
6. Response displays with typewriter animation

### 4.4 Guest — Searching in Sidebar
1. User types in the search bar in the sidebar (desktop) or bottom sheet (mobile)
2. Rooms and offices filter in real-time by name
3. User taps a room or office → map flies to building, Quick Nav panel opens

### 4.5 Admin — Managing Campus Data
1. Admin navigates to `/super-admin-login-form`
2. Logs in with super_admin credentials
3. Dashboard shows overview stats
4. Admin selects a tab (Buildings, Rooms, Offices, etc.)
5. Can create, edit, delete, reactivate entities
6. Map Editor tab allows visual pin placement on the map

### 4.6 Admin — Setting Maintenance Mode
1. Admin goes to Settings tab
2. Toggles "Maintenance Mode" on
3. GuestView now shows maintenance screen instead of map
4. Toggle off to restore normal operation

---

## 5. ENVIRONMENT VARIABLES

### Backend (.env)
| Variable | Description |
|----------|-------------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for JWT token signing |
| `PORT` | Server port (default: 3001) |
| `OPENAI_API_KEY` | OpenAI API key for chatbot |

### Frontend (.env)
| Variable | Description |
|----------|-------------|
| `REACT_APP_MAPBOX_TOKEN` | Mapbox access token for map rendering |
| `REACT_APP_API_URL` | Backend API base URL |
| `REACT_APP_MODE` | App mode: `'guest'`, `'admin'`, or `'all'` |
| `REACT_APP_HIDE_GUEST_LOGIN` | Hide login UI from guest view |
| `REACT_APP_SUPERADMIN_URL` | Separate admin host URL |

---

## 6. FILE STRUCTURE SUMMARY

```
ALAGAD/
├── SETUP.md                          # Setup instructions
├── SYSTEM_DOCUMENTATION.md           # This file
│
├── alagad-backend/                   # Node.js Express API Server
│   ├── server.js                     # Express app entry point
│   ├── package.json                  # Dependencies
│   ├── populate-database.js          # Database seeder
│   ├── middleware/
│   │   └── authMiddleware.js         # JWT auth + role authorization
│   ├── models/
│   │   ├── User.js                   # User schema (auth, roles)
│   │   ├── Building.js               # Building schema (campus structures)
│   │   ├── Room.js                   # Room schema (inside buildings)
│   │   ├── Office.js                 # Office schema (admin/faculty offices)
│   │   ├── FacultyStaff.js           # Faculty/staff directory
│   │   ├── Service.js                # Campus services
│   │   ├── Department.js             # Academic/admin departments
│   │   └── Settings.js               # System settings (maintenance mode)
│   ├── routes/
│   │   ├── userRoutes.js             # Auth endpoints
│   │   ├── buildingRoutes.js         # Building CRUD
│   │   ├── roomRoutes.js             # Room CRUD
│   │   ├── officeRoutes.js           # Office CRUD
│   │   ├── facultyRoutes.js          # Faculty CRUD
│   │   ├── serviceRoutes.js          # Service CRUD
│   │   ├── departmentRoutes.js       # Department CRUD
│   │   ├── settingsRoutes.js         # System settings
│   │   ├── overviewRoutes.js         # Dashboard stats
│   │   ├── mapRoutes.js              # Map features/pins
│   │   └── chatbotRoutes.js          # AI chatbot
│   └── scripts/
│       ├── seedAdmin.js              # Create admin user
│       ├── backfillDepartmentBuildings.js
│       ├── checkDepartments.js
│       ├── checkServices.js
│       └── cleanupMapFeatures.js
│
├── alagad-frontend/                  # React Single Page Application
│   ├── package.json                  # Dependencies
│   ├── public/                       # Static assets
│   └── src/
│       ├── App.js                    # Root router component
│       ├── index.js                  # React DOM entry
│       ├── context/
│       │   ├── AuthContext.js         # Authentication state provider
│       │   └── MapContext.js          # Map state + geolocation provider
│       ├── views/
│       │   ├── LandingPage.js         # Welcome/portal page
│       │   ├── GuestView.js           # Interactive campus map (main feature)
│       │   ├── SuperAdminLoginForm.js  # Admin login
│       │   └── SuperAdminDashboard.js  # Admin control panel
│       ├── components/
│       │   ├── ChatBot.js             # AI chatbot widget
│       │   ├── BuildingMarkers.js     # Map building pins
│       │   ├── BoxMarker.js           # Styled pin component
│       │   ├── BuildingPopup.js       # Map marker popup
│       │   ├── QuickNavPanel.js       # Building details panel
│       │   ├── MapEditor.js           # Admin map pin editor
│       │   ├── MapComponent.js        # Reusable map display
│       │   ├── SafeGeoJSON.js         # Safe GeoJSON renderer
│       │   ├── WalkableRoutes.js      # Path visualization
│       │   └── CampusBoundaryFocus.js # Map boundary constraint
│       ├── hooks/
│       │   └── useVoiceRecognition.js # Speech recognition hook
│       ├── utils/
│       │   ├── api.js                 # REST API client
│       │   ├── campusPathfinding.js   # A* walking directions
│       │   ├── icons.js               # Icon components
│       │   ├── translations.js        # Multilingual strings
│       │   ├── mapBoundaries.js       # Campus boundary coords
│       │   └── mapboxDirections.js    # Mapbox Directions helper
│       ├── data/
│       │   └── walkableRoutes.json    # Campus walkable paths
│       └── styles/                    # CSS stylesheets
```
