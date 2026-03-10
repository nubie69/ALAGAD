const mongoose = require('mongoose');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected Successfully');
  })
  .catch((error) => {
    console.error('MongoDB Connection Error:', error.message);
    process.exit(1);
  });

// Routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/buildings', require('./routes/buildingRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));
app.use('/api/offices', require('./routes/officeRoutes'));
app.use('/api/faculty', require('./routes/facultyRoutes'));
app.use('/api/services', require('./routes/serviceRoutes'));
app.use('/api/departments', require('./routes/departmentRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/overview', require('./routes/overviewRoutes'));
app.use('/api/map', require('./routes/mapRoutes'));
app.use('/api/chat', require('./routes/chatbotRoutes'));

// Health check routes
app.get('/', (req, res) => {
  res.send('ALAGAD Backend API is running...');
});

app.get('/testdb', (req, res) => {
  if (mongoose.connection.readyState === 1) {
    res.status(200).send('Database connected successfully!');
  } else {
    res.status(500).send('Database connection failed.');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Accessible on your local network`);
});
