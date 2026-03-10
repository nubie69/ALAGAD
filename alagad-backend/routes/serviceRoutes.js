const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Service = require('../models/Service');
const { protect, authorize } = require('../middleware/authMiddleware');

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

// @desc    Get all services
// @route   GET /api/services
// @access  Public
router.get('/', async (req, res) => {
  try {
    const filter = isAuthenticated(req) ? {} : { isActive: { $ne: false } };
    const services = await Service.find(filter)
      .populate({ path: 'office', populate: { path: 'building', select: 'name location' } })
      .sort({ name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get services for current user's office or department
// @route   GET /api/services/office/my
// @access  Private (Super Admin)
router.get('/office/my', protect, authorize('super_admin'), async (req, res) => {
  try {
    const services = await Service.find()
      .populate({ path: 'office', populate: { path: 'building', select: 'name location' } })
      .sort({ name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get single service
// @route   GET /api/services/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create service
// @route   POST /api/services
// @access  Private (Super Admin)
router.post('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    const serviceData = { ...req.body };
    
    // Super admin specifies assignment
    const normalizedDept = (typeof serviceData.department === 'string' && serviceData.department.trim() !== '') ? serviceData.department.trim() : null;
    const normalizedOffice = (typeof serviceData.office === 'string' && serviceData.office.trim() !== '') ? serviceData.office.trim() : null;
    serviceData.department = normalizedDept;
    serviceData.office = normalizedOffice;

    const service = await Service.create(serviceData);
    res.status(201).json(service);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Service with this name already exists' });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
});

// @desc    Update service
// @route   PUT /api/services/:id
// @access  Private (Super Admin)
router.put('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    const updateData = { ...req.body };
    // Super admin - normalize assignment
    const normalizedDept = (typeof updateData.department === 'string' && updateData.department.trim() !== '') ? updateData.department.trim() : null;
    const normalizedOffice = (typeof updateData.office === 'string' && updateData.office.trim() !== '') ? updateData.office.trim() : null;
    updateData.department = normalizedDept;
    updateData.office = normalizedOffice;

    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    res.json(updatedService);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete service
// @route   DELETE /api/services/:id
// @access  Private (Super Admin)
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    await Service.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Service deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Reactivate service
// @route   PUT /api/services/:id/reactivate
// @access  Private (Super Admin)
router.put('/:id/reactivate', protect, authorize('super_admin'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    await Service.findByIdAndUpdate(req.params.id, { isActive: true });
    res.json({ message: 'Service reactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
