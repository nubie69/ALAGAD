const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Room = require('../models/Room');
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

// @desc    Get all rooms
// @route   GET /api/rooms
// @access  Public
router.get('/', async (req, res) => {
  try {
    const filter = isAuthenticated(req) ? {} : { isActive: { $ne: false } };
    const rooms = await Room.find(filter).populate('building', 'name location').sort({ name: 1 });
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get rooms for current user's department
// @route   GET /api/rooms/department/my
// @access  Private (Super Admin)
router.get('/department/my', protect, authorize('super_admin'), async (req, res) => {
  try {
    const rooms = await Room.find({ department: req.user.department })
      .populate('building', 'name location')
      .sort({ name: 1 });
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get rooms by building
// @route   GET /api/rooms/building/:buildingId
// @access  Public
router.get('/building/:buildingId', async (req, res) => {
  try {
    const rooms = await Room.find({ building: req.params.buildingId })
      .populate('building', 'name location')
      .sort({ floor: 1, name: 1 });
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get single room
// @route   GET /api/rooms/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).populate('building', 'name location');
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create room
// @route   POST /api/rooms
// @access  Private (Super Admin)
router.post('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    const department = req.body.department || req.user.department || 'Unassigned';

    const roomData = {
      ...req.body,
      department,
    };
    if (Object.prototype.hasOwnProperty.call(roomData, 'is_active')) {
      roomData.isActive = Boolean(roomData.is_active);
      delete roomData.is_active;
    }
    const room = await Room.create(roomData);
    await room.populate('building', 'name location');
    await syncRecordIndexByType('Room', room._id);
    res.status(201).json(room);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Room with this name already exists' });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
});

// @desc    Update room
// @route   PUT /api/rooms/:id
// @access  Private (Super Admin)
router.put('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const updateData = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updateData, 'is_active')) {
      updateData.isActive = Boolean(updateData.is_active);
      delete updateData.is_active;
    }

    const updatedRoom = await Room.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('building', 'name location');
    await syncRecordIndexByType('Room', updatedRoom?._id || req.params.id);
    res.json(updatedRoom);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete room
// @route   DELETE /api/rooms/:id
// @access  Private (Super Admin)
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    await Room.findByIdAndUpdate(req.params.id, { isActive: false });
    await syncRecordDeactivationByType('Room', req.params.id, true);
    res.json({ message: 'Room deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Reactivate room
// @route   PUT /api/rooms/:id/reactivate
// @access  Private (Super Admin)
router.put('/:id/reactivate', protect, authorize('super_admin'), async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    await Room.findByIdAndUpdate(req.params.id, { isActive: true });
    await syncRecordIndexByType('Room', req.params.id);
    await syncRecordDeactivationByType('Room', req.params.id, false);
    res.json({ message: 'Room reactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
