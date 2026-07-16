const express = require('express');
const router = express.Router();
const Department = require('../models/Department');
const Building = require('../models/Building');
const Room = require('../models/Room');
const Office = require('../models/Office');
const FacultyStaff = require('../models/FacultyStaff');
const Service = require('../models/Service');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
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

const DEFAULT_DEPARTMENTS = [
  { name: 'IT Department', code: 'IT', description: 'Information Technology' },
  { name: 'Academic Affairs', code: 'Academic', description: 'Academic operations and programs' },
  { name: 'Administration', code: 'Administration', description: 'Administrative services' },
  { name: 'Facilities Management', code: 'Facilities', description: 'Campus facilities and maintenance' },
  { name: 'Campus Security', code: 'Security', description: 'Safety and security services' },
];

const ensureDefaultDepartments = async () => {
  const count = await Department.countDocuments();
  if (count > 0) return;
  await Department.insertMany(DEFAULT_DEPARTMENTS);
};

// @desc    Get all departments
// @route   GET /api/departments
// @access  Public (guests see only active; admins see all)
router.get('/', async (req, res) => {
  try {
    await ensureDefaultDepartments();
    const filter = isAuthenticated(req) ? {} : { active: { $ne: false } };
    const departments = await Department.find(filter).populate('building', 'name location numberOfFloors').sort({ name: 1 });
    console.log('Departments fetched:', departments.map(d => ({ name: d.name, building: d.building?.name, floor: d.floor })));
    res.json(departments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create department
// @route   POST /api/departments
// @access  Private (Super Admin only)
router.post('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    const { name, code, description, building, floor, active, is_active: isActiveInput } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Department name is required' });
    }

    const resolvedActive = isActiveInput !== undefined
      ? Boolean(isActiveInput)
      : (active !== undefined ? active : true);

    const department = await Department.create({
      name: name.trim(),
      code: code ? code.trim() : '',
      description: description ? description.trim() : '',
      building: building || undefined,
      floor: floor || undefined,
      active: resolvedActive,
    });

    await department.populate('building', 'name location');
    await syncRecordIndexByType('Department', department._id);
    res.status(201).json(department);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Department with this name already exists' });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
});

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private (Super Admin only)
router.put('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const { name, code, description, building, floor, active, is_active: isActiveInput } = req.body;
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    if (name !== undefined) department.name = name.trim();
    if (code !== undefined) department.code = code.trim();
    if (description !== undefined) department.description = description.trim();
    if (building !== undefined) department.building = building || undefined;
    if (floor !== undefined) department.floor = floor || undefined;
    if (isActiveInput !== undefined) {
      department.active = Boolean(isActiveInput);
    } else if (active !== undefined) {
      department.active = active;
    }

    await department.save();
    await department.populate('building', 'name location');
    await syncRecordIndexByType('Department', department._id);
    res.json(department);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Department with this name already exists' });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
});

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private (Super Admin only)
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    await Department.findByIdAndUpdate(req.params.id, { active: false });
    await syncRecordDeactivationByType('Department', req.params.id, true);
    res.json({ message: 'Department deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Reactivate department
// @route   PUT /api/departments/:id/reactivate
// @access  Private (Super Admin only)
router.put('/:id/reactivate', protect, authorize('super_admin'), async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) return res.status(404).json({ message: 'Department not found' });
    await Department.findByIdAndUpdate(req.params.id, { active: true });
    await syncRecordIndexByType('Department', req.params.id);
    await syncRecordDeactivationByType('Department', req.params.id, false);
    res.json({ message: 'Department reactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
