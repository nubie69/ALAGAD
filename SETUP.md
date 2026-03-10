# ALAGAD Campus Navigation System - Setup Guide

## Overview
ALAGAD is a comprehensive campus navigation system with:
- Interactive map with Mapbox Map (focused on Bukidnon State University campus)
- Chatbot for navigation assistance
- Role-based access (Guest, Admin)
- Full CRUD operations for campus data
- Real-time map feature management

## System Architecture

### Backend (Node.js + Express + MongoDB)
- **Server**: Express.js REST API
- **Database**: MongoDB (MongoDB Atlas)
- **Authentication**: JWT tokens
- **Models**: User, Building, Room, Office, FacultyStaff, Service

### Frontend (React)
- **Framework**: React 19 with React Router
- **Map Library**: Google Maps (@react-google-maps/api) + browser geolocation
- **State Management**: React Context API
- **API Integration**: Custom API utility

## Setup Instructions

### 1. Backend Setup

1. Navigate to the backend directory:
```bash
cd alagad-backend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables in `.env`:
```
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb+srv://Alagad:<db_password>@cluster0.99dcypv.mongodb.net/?appName=Cluster0
JWT_SECRET=supersecretjwtkey
```

**Important**: Replace `<db_password>` with your actual MongoDB password.

4. Start the server:
```bash
npm run dev
```

The backend will run on `http://localhost:5000`

### 2. Frontend Setup

1. Navigate to the frontend directory:
```bash
cd alagad-frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with:
```
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

**Google Maps API Key** (required for the map):
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Enable **Maps JavaScript API** and **Maps Drawing Library**
4. Create an API key under Credentials
5. Add the key to `.env` as `REACT_APP_GOOGLE_MAPS_API_KEY`

4. Start the development server:
```bash
npm start
```

The frontend will run on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/users/login` - Login user
- `POST /api/users` - Register new user (Super Admin only)
- `GET /api/users/me` - Get current user

### Buildings
- `GET /api/buildings` - Get all buildings
- `GET /api/buildings/:id` - Get single building
- `POST /api/buildings` - Create building (Admin/Super Admin)
- `PUT /api/buildings/:id` - Update building (Admin/Super Admin)
- `DELETE /api/buildings/:id` - Delete building (Super Admin only)

### Rooms
- `GET /api/rooms` - Get all rooms
- `GET /api/rooms/building/:buildingId` - Get rooms by building
- `GET /api/rooms/:id` - Get single room
- `POST /api/rooms` - Create room (Admin/Super Admin)
- `PUT /api/rooms/:id` - Update room (Admin/Super Admin)
- `DELETE /api/rooms/:id` - Delete room (Super Admin only)

### Offices
- `GET /api/offices` - Get all offices
- `GET /api/offices/:id` - Get single office
- `POST /api/offices` - Create office (Admin/Super Admin)
- `PUT /api/offices/:id` - Update office (Admin/Super Admin)
- `DELETE /api/offices/:id` - Delete office (Super Admin only)

### Faculty/Staff
- `GET /api/faculty` - Get all faculty/staff
- `GET /api/faculty/office/:officeId` - Get faculty by office
- `GET /api/faculty/:id` - Get single faculty/staff
- `POST /api/faculty` - Create faculty/staff (Admin/Super Admin)
- `PUT /api/faculty/:id` - Update faculty/staff (Admin/Super Admin)
- `DELETE /api/faculty/:id` - Delete faculty/staff (Super Admin only)

### Services
- `GET /api/services` - Get all services
- `GET /api/services/:id` - Get single service
- `POST /api/services` - Create service (Admin/Super Admin)
- `PUT /api/services/:id` - Update service (Admin/Super Admin)
- `DELETE /api/services/:id` - Delete service (Super Admin only)

### Map Features
- `GET /api/map/features` - Get all map features as GeoJSON
- `POST /api/map/features` - Save map feature (Super Admin only)
- `POST /api/map/features/new` - Create new map feature (Super Admin only)
- `DELETE /api/map/features/:id` - Delete map feature (Super Admin only)

## User Roles

### Guest
- View the interactive map
- Use the chatbot for navigation
- View campus features

### Admin
- All admin permissions
- Delete any records
- Manage map features directly on the map
- Create and manage users
- Full system access

### Option 1: Create a seed script
Create a file `alagad-backend/scripts/seedAdmin.js`:
```javascript
const mongoose = require('mongoose');
const User = require('../models/User');
const dotenv = require('dotenv');

dotenv.config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const admin = await User.create({
      name: 'Admin',
      email: 'buksu.alagad@gmail.com',
      password: 'admin001', // Will be hashed automatically
      role: 'admin'
    });
    console.log('Super Admin created:', admin);
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
```

Run it with: `node scripts/seedAdmin.js`

## Features

### Interactive Map
- Click anywhere to see coordinates
- View buildings (polygons) and offices (markers)
- Super Admins can draw new features directly on the map
- Features are automatically saved to the database

### Chatbot
The chatbot can answer questions about:
- Buildings and their locations
- Offices and contact information
- Faculty and staff members
- Navigation assistance

Try asking:
- "What buildings are on campus?"
- "Where is [building name]?"
- "Find [person name]"
- "List all offices"

### Dashboards
- **Admin Dashboard**: View overview of campus data
- **Super Admin Dashboard**: Full CRUD interface for all data types

## Troubleshooting

### Backend won't start
- Check MongoDB connection string in `.env`
- Ensure MongoDB Atlas IP whitelist includes your IP
- Verify all dependencies are installed

### Frontend can't connect to backend
- Ensure backend is running on port 5000
- Check CORS settings
- Verify `REACT_APP_API_URL` in frontend `.env`

### Authentication issues
- Check JWT_SECRET in backend `.env`
- Verify token is being stored in localStorage
- Check browser console for API errors

## Next Steps

1. Create your first Super Admin user
2. Log in and start adding campus data
3. Draw buildings and offices on the map
4. Test the chatbot with real data
5. Customize the system for your campus needs

## Development Notes

- The system uses JWT tokens stored in localStorage
- Map features are stored as GeoJSON in MongoDB
- All API calls include authentication headers when logged in
- The chatbot queries real data from the backend
