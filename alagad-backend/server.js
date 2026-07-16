const mongoose = require('mongoose');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { sharedVectorIndexManager } = require('./services/retrieval/vectorIndexManager');
const { logAlert, logAudit } = require('./services/retrieval/auditLogger');
const SearchLog = require('./models/SearchLog');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const REINDEX_ON_STARTUP = String(process.env.REINDEX_ON_STARTUP || 'true').toLowerCase() !== 'false';
const REINDEX_INTERVAL_MS = Number(process.env.REINDEX_INTERVAL_MS || 0);

const bootstrapVectorIndex = async () => {
  if (!REINDEX_ON_STARTUP) return;

  try {
    const state = await sharedVectorIndexManager.rebuildFromDatabase();
    logAudit({
      event: 'vector_bulk_rebuild',
      trigger: 'startup',
      vector_count: state.vectorCount,
      canonical_count: state.canonicalDocuments.length,
      success: true,
    });
    console.log(`Vector index rebuilt on startup (vectors=${state.vectorCount})`);
  } catch (error) {
    logAlert({
      alert_type: 'vector_bulk_rebuild_failure',
      trigger: 'startup',
      message: error.message,
      stack: error.stack,
    });
    console.error('Vector index startup rebuild failed:', error.message);
  }
};

const startVectorReindexLoop = () => {
  if (!Number.isFinite(REINDEX_INTERVAL_MS) || REINDEX_INTERVAL_MS <= 0) return;

  setInterval(async () => {
    try {
      const state = await sharedVectorIndexManager.rebuildFromDatabase();
      logAudit({
        event: 'vector_bulk_rebuild',
        trigger: 'interval',
        vector_count: state.vectorCount,
        canonical_count: state.canonicalDocuments.length,
        success: true,
      });
    } catch (error) {
      logAlert({
        alert_type: 'vector_bulk_rebuild_failure',
        trigger: 'interval',
        message: error.message,
        stack: error.stack,
      });
    }
  }, REINDEX_INTERVAL_MS).unref();
};

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
  .then(async () => {
    console.log('MongoDB Connected Successfully');
    await SearchLog.createCollection().catch(() => null);
    await bootstrapVectorIndex();
    startVectorReindexLoop();
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
app.use('/api/chat', require('./routes/chatbotDeterministicRoutes'));
app.use('/api/popular', require('./routes/popularRoutes'));

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
