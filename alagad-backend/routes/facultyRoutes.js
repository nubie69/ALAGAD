const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const FacultyStaff = require('../models/FacultyStaff');
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

// @desc    Get all faculty/staff
// @route   GET /api/faculty
// @access  Public
router.get('/', async (req, res) => {
  try {
    const filter = isAuthenticated(req) ? {} : { isActive: { $ne: false } };
    const faculty = await FacultyStaff.find(filter)
      .populate({
        path: 'office',
        populate: [
          { path: 'building', select: 'name location' },
          { path: 'room', select: 'name floor' }
        ]
      })
      .sort({ name: 1 });
    res.json(faculty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get faculty/staff for current user's department
// @route   GET /api/faculty/department/my
// @access  Private (Super Admin)
router.get('/department/my', protect, authorize('super_admin'), async (req, res) => {
  try {
    const faculty = await FacultyStaff.find({ department: req.user.department })
      .populate({
        path: 'office',
        populate: [
          { path: 'building', select: 'name location' },
          { path: 'room', select: 'name floor' }
        ]
      })
      .sort({ name: 1 });
    res.json(faculty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get faculty by office
// @route   GET /api/faculty/office/:officeId
// @access  Public
router.get('/office/:officeId', async (req, res) => {
  try {
    const faculty = await FacultyStaff.find({ office: req.params.officeId })
      .populate({
        path: 'office',
        populate: [
          { path: 'building', select: 'name location' },
          { path: 'room', select: 'name floor' }
        ]
      })
      .sort({ name: 1 });
    res.json(faculty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get single faculty/staff
// @route   GET /api/faculty/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const faculty = await FacultyStaff.findById(req.params.id)
      .populate({
        path: 'office',
        populate: [
          { path: 'building', select: 'name location' },
          { path: 'room', select: 'name floor' }
        ]
      });
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty/Staff not found' });
    }
    res.json(faculty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create faculty/staff
// @route   POST /api/faculty
// @access  Private (Super Admin)
router.post('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    const facultyData = { ...req.body };
    // Super admin: use office or department as provided by the form
    // Ensure only one assignment type is set
    if (facultyData.office) {
      delete facultyData.department;
    } else if (!facultyData.department) {
      facultyData.department = 'Unassigned';
    }

    const faculty = await FacultyStaff.create(facultyData);
    await faculty.populate({
      path: 'office',
      populate: [
        { path: 'building', select: 'name location' },
        { path: 'room', select: 'name floor' }
      ]
    });
    res.status(201).json(faculty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update faculty/staff
// @route   PUT /api/faculty/:id
// @access  Private (Super Admin)
router.put('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const faculty = await FacultyStaff.findById(req.params.id);
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty/Staff not found' });
    }

    const updateData = { ...req.body };
    // Ensure only one assignment type: office or department
    if (updateData.office) {
      updateData.department = null;
    } else if (updateData.department) {
      updateData.office = null;
    }

    const updatedFaculty = await FacultyStaff.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate({
      path: 'office',
      populate: [
        { path: 'building', select: 'name location' },
        { path: 'room', select: 'name floor' }
      ]
    });
    res.json(updatedFaculty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete faculty/staff
// @route   DELETE /api/faculty/:id
// @access  Private (Super Admin)
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const faculty = await FacultyStaff.findById(req.params.id);
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty/Staff not found' });
    }
    
    await FacultyStaff.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Faculty/Staff deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Reactivate faculty/staff
// @route   PUT /api/faculty/:id/reactivate
// @access  Private (Super Admin)
router.put('/:id/reactivate', protect, authorize('super_admin'), async (req, res) => {
  try {
    const faculty = await FacultyStaff.findById(req.params.id);
    if (!faculty) return res.status(404).json({ message: 'Faculty/Staff not found' });
    await FacultyStaff.findByIdAndUpdate(req.params.id, { isActive: true });
    res.json({ message: 'Faculty/Staff reactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
