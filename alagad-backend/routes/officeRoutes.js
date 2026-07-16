const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Office = require('../models/Office');
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

// @desc    Get all offices
// @route   GET /api/offices
// @access  Public
router.get('/', async (req, res) => {
  try {
    const filter = isAuthenticated(req) ? {} : { isActive: { $ne: false } };
    const offices = await Office.find(filter)
      .populate('building', 'name location')
      .populate('room', 'name floor')
      .populate('services', 'name description')
      .sort({ name: 1 });
    res.json(offices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get offices for current admin's department
// @route   GET /api/offices/department/my
// @access  Private (Super Admin)
router.get('/department/my', protect, authorize('super_admin'), async (req, res) => {
  try {
    const offices = await Office.find({ department: req.user.department })
      .populate('building', 'name location')
      .populate('room', 'name floor')
      .populate('services', 'name description')
      .sort({ name: 1 });
    res.json(offices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get single office
// @route   GET /api/offices/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const office = await Office.findById(req.params.id)
      .populate('building', 'name location')
      .populate('room', 'name floor')
      .populate('services', 'name description');
    if (!office) {
      return res.status(404).json({ message: 'Office not found' });
    }
    res.json(office);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create office
// @route   POST /api/offices
// @access  Private (Super Admin)
router.post('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    const department = req.body.department || req.user.department || 'Unassigned';

    const officeData = {
      ...req.body,
      department,
    };
    if (Object.prototype.hasOwnProperty.call(officeData, 'is_active')) {
      officeData.isActive = Boolean(officeData.is_active);
      delete officeData.is_active;
    }
    const office = await Office.create(officeData);
    await office.populate('building', 'name location');
    await office.populate('room', 'name floor');
    await office.populate('services', 'name description');
    await syncRecordIndexByType('Office', office._id);
    res.status(201).json(office);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Office with this name already exists' });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
});

// @desc    Update office
// @route   PUT /api/offices/:id
// @access  Private (Super Admin)
router.put('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const office = await Office.findById(req.params.id);
    if (!office) {
      return res.status(404).json({ message: 'Office not found' });
    }

    const updateData = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updateData, 'is_active')) {
      updateData.isActive = Boolean(updateData.is_active);
      delete updateData.is_active;
    }

    const updatedOffice = await Office.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('building', 'name location')
      .populate('room', 'name floor')
      .populate('services', 'name description');
    await syncRecordIndexByType('Office', updatedOffice?._id || req.params.id);
    res.json(updatedOffice);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete office
// @route   DELETE /api/offices/:id
// @access  Private (Super Admin)
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const office = await Office.findById(req.params.id);
    if (!office) {
      return res.status(404).json({ message: 'Office not found' });
    }
    
    await Office.findByIdAndUpdate(req.params.id, { isActive: false });
    await syncRecordDeactivationByType('Office', req.params.id, true);
    res.json({ message: 'Office deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Reactivate office
// @route   PUT /api/offices/:id/reactivate
// @access  Private (Super Admin)
router.put('/:id/reactivate', protect, authorize('super_admin'), async (req, res) => {
  try {
    const office = await Office.findById(req.params.id);
    if (!office) return res.status(404).json({ message: 'Office not found' });
    await Office.findByIdAndUpdate(req.params.id, { isActive: true });
    await syncRecordIndexByType('Office', req.params.id);
    await syncRecordDeactivationByType('Office', req.params.id, false);
    res.json({ message: 'Office reactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
