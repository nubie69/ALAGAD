const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { protect, authorize } = require('../middleware/authMiddleware');

const getOrCreateSettings = async () => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
};

// @desc    Get public system status (maintenance/kiosk)
// @route   GET /api/settings/status
// @access  Public
router.get('/status', async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({
      maintenanceMode: settings.maintenanceMode,
      kioskStatus: settings.kioskStatus,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get system settings
// @route   GET /api/settings
// @access  Private (Super Admin only)
router.get('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update system settings
// @route   PUT /api/settings
// @access  Private (Super Admin only)
router.put('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    const { maintenanceMode, kioskStatus } = req.body;
    const settings = await getOrCreateSettings();

    if (typeof maintenanceMode === 'boolean') {
      settings.maintenanceMode = maintenanceMode;
      if (!kioskStatus) {
        settings.kioskStatus = maintenanceMode ? 'maintenance' : 'online';
      }
    }

    if (kioskStatus) {
      settings.kioskStatus = kioskStatus;
    }

    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
