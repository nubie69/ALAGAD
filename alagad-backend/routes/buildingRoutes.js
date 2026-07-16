const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Building = require('../models/Building');
const { protect, authorize } = require('../middleware/authMiddleware');
const { syncRecordIndexByType, syncRecordDeactivationByType } = require('../services/retrieval/indexSyncService');

// Helper: check if request has a valid admin token
const isAuthenticated = (req) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer')) return false;
    const token = auth.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET);
    return true;
  } catch { return false; }
};

// @desc    Get all buildings
// @route   GET /api/buildings
// @access  Public
router.get('/', async (req, res) => {
  try {
    const filter = isAuthenticated(req) ? {} : { isActive: { $ne: false } };
    const buildings = await Building.find(filter).sort({ name: 1 });
    res.json(buildings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get buildings for current admin's department
// @route   GET /api/buildings/department/my
// @access  Private (Super Admin)
router.get('/department/my', protect, authorize('super_admin'), async (req, res) => {
  try {
    const buildings = await Building.find({ department: req.user.department }).sort({ name: 1 });
    res.json(buildings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get single building
// @route   GET /api/buildings/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building) {
      return res.status(404).json({ message: 'Building not found' });
    }
    // Hide inactive buildings from public users
    if (!isAuthenticated(req) && building.isActive === false) {
      return res.status(404).json({ message: 'Building not found' });
    }
    res.json(building);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create building
// @route   POST /api/buildings
// @access  Private (Super Admin)
router.post('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    const department = req.body.department || req.user.department || 'Unassigned';

    const buildingData = {
      ...req.body,
      department,
    };
    if (Object.prototype.hasOwnProperty.call(buildingData, 'is_active')) {
      buildingData.isActive = Boolean(buildingData.is_active);
      delete buildingData.is_active;
    }
    const building = await Building.create(buildingData);
    await syncRecordIndexByType('Building', building._id);
    res.status(201).json(building);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Building with this name already exists' });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
});

// @desc    Update building
// @route   PUT /api/buildings/:id
// @access  Private (Super Admin)
router.put('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building) {
      return res.status(404).json({ message: 'Building not found' });
    }

    const updateData = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updateData, 'is_active')) {
      updateData.isActive = Boolean(updateData.is_active);
      delete updateData.is_active;
    }

    const updatedBuilding = await Building.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    await syncRecordIndexByType('Building', updatedBuilding?._id || req.params.id);
    res.json(updatedBuilding);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete building
// @route   DELETE /api/buildings/:id
// @access  Private (Super Admin)
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building) {
      return res.status(404).json({ message: 'Building not found' });
    }
    
    await Building.findByIdAndUpdate(req.params.id, { isActive: false });
    await syncRecordDeactivationByType('Building', req.params.id, true);
    res.json({ message: 'Building deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Reactivate building
// @route   PUT /api/buildings/:id/reactivate
// @access  Private (Super Admin)
router.put('/:id/reactivate', protect, authorize('super_admin'), async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building) return res.status(404).json({ message: 'Building not found' });
    await Building.findByIdAndUpdate(req.params.id, { isActive: true });
    await syncRecordIndexByType('Building', req.params.id);
    await syncRecordDeactivationByType('Building', req.params.id, false);
    res.json({ message: 'Building reactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Upload building image (base64)
// @route   POST /api/buildings/:id/image
// @access  Private (Super Admin)
router.post('/:id/image', protect, authorize('super_admin'), async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building) return res.status(404).json({ message: 'Building not found' });

    const { image } = req.body;
    if (!image) return res.status(400).json({ message: 'No image data provided' });

    // Validate it's a data URI
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ message: 'Invalid image format. Must be a data URI.' });
    }

    building.image = image;
    await building.save();

    res.json({ image: building.image });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete building image
// @route   DELETE /api/buildings/:id/image
// @access  Private (Super Admin)
router.delete('/:id/image', protect, authorize('super_admin'), async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building) return res.status(404).json({ message: 'Building not found' });

    building.image = undefined;
    await building.save();

    res.json({ message: 'Image removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
