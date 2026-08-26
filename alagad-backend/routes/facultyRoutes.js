const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const FacultyStaff = require('../models/FacultyStaff');
const Department = require('../models/Department');
const Office = require('../models/Office');
const { protect, authorize } = require('../middleware/authMiddleware');
const { syncRecordIndexByType, syncRecordDeactivationByType } = require('../services/retrieval/indexSyncService');

const AVAILABILITY_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEFAULT_AVAILABILITY_TIME_SLOT = '8:00 AM – 5:00 PM';

const PERSONNEL_POPULATE = [
  {
    path: 'office',
    populate: [
      { path: 'building', select: 'name location' },
      { path: 'room', select: 'name floor' },
    ],
  },
  { path: 'departmentId', select: 'name code active' },
  { path: 'supervisorId', select: 'name title office department departmentId isActive' },
];

class PersonnelValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const idOf = (value) => String(value?._id || value || '');

const normalizePersonnelPayload = async (input, existing = null, personnelId = null) => {
  const data = { ...input };
  if (hasOwn(data, 'position') && !hasOwn(data, 'title')) data.title = data.position;
  delete data.position;

  const title = hasOwn(data, 'title') ? String(data.title || '').trim() : String(existing?.title || '').trim();
  if (!title) throw new PersonnelValidationError('Position is required.');
  data.title = title;
  if (hasOwn(data, 'positionType')) data.positionType = String(data.positionType || '').trim() || 'custom';
  else if (!existing) data.positionType = 'custom';

  const officeWasProvided = hasOwn(data, 'office') || hasOwn(data, 'officeId');
  const departmentWasProvided = hasOwn(data, 'departmentId') || hasOwn(data, 'department');
  const officeValue = data.office || data.officeId || null;
  const departmentValue = data.departmentId || data.department || null;
  delete data.officeId;

  if (officeWasProvided && officeValue) {
    if (!mongoose.isValidObjectId(officeValue)) throw new PersonnelValidationError('Invalid office ID.');
    const office = await Office.findOne({ _id: officeValue, isActive: { $ne: false } }).select('_id');
    if (!office) throw new PersonnelValidationError('The selected office no longer exists.');
    data.office = office._id;
    data.departmentId = null;
    data.department = null;
  } else if (departmentWasProvided && departmentValue) {
    const department = mongoose.isValidObjectId(departmentValue)
      ? await Department.findOne({ _id: departmentValue, active: { $ne: false } }).select('_id name')
      : await Department.findOne({ name: String(departmentValue).trim(), active: { $ne: false } }).select('_id name');
    if (!department) throw new PersonnelValidationError('The selected department no longer exists.');
    data.departmentId = department._id;
    data.department = department.name;
    data.office = null;
  } else if (officeWasProvided || departmentWasProvided) {
    throw new PersonnelValidationError('Office/Department is required.');
  }

  const targetOffice = hasOwn(data, 'office') ? data.office : existing?.office;
  const targetDepartmentId = hasOwn(data, 'departmentId') ? data.departmentId : existing?.departmentId;
  const targetDepartmentName = hasOwn(data, 'department') ? data.department : existing?.department;
  if (!targetOffice && !targetDepartmentId && !targetDepartmentName) throw new PersonnelValidationError('Office/Department is required.');

  const requestedSupervisor = hasOwn(data, 'supervisorId') ? data.supervisorId : existing?.supervisorId;
  if (!requestedSupervisor) {
    if (hasOwn(data, 'supervisorId')) data.supervisorId = null;
    return data;
  }
  if (!mongoose.isValidObjectId(requestedSupervisor)) throw new PersonnelValidationError('Invalid supervisor ID.');
  if (personnelId && idOf(requestedSupervisor) === idOf(personnelId)) throw new PersonnelValidationError('Personnel cannot report to themselves.');

  const supervisor = await FacultyStaff.findOne({ _id: requestedSupervisor, isActive: { $ne: false } })
    .select('_id office department departmentId');
  if (!supervisor) throw new PersonnelValidationError('The selected supervisor no longer exists or is inactive.');

  const sameOffice = targetOffice && supervisor.office && idOf(targetOffice) === idOf(supervisor.office);
  const sameDepartment = (targetDepartmentId && supervisor.departmentId && idOf(targetDepartmentId) === idOf(supervisor.departmentId))
    || (!targetDepartmentId && targetDepartmentName && supervisor.department === targetDepartmentName);
  if (!sameOffice && !sameDepartment) throw new PersonnelValidationError('Supervisor must belong to the same office or department.');
  data.supervisorId = supervisor._id;
  return data;
};

const sendRouteError = (res, error) => res.status(error.statusCode || 500).json({ message: error.message });

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

const normalizeAvailability = (input, fallback = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const fallbackSource = fallback && typeof fallback === 'object' ? fallback : {};

  const rawDays = Array.isArray(source.daysAvailable)
    ? source.daysAvailable
    : Array.isArray(fallbackSource.daysAvailable)
      ? fallbackSource.daysAvailable
      : [];

  const normalizedDaySet = new Set(
    rawDays
      .map((day) => String(day || '').trim())
      .filter((day) => AVAILABILITY_DAYS.includes(day))
  );

  const rawTimeSlot = source.timeSlot != null
    ? source.timeSlot
    : fallbackSource.timeSlot;
  const normalizedTimeSlot = String(rawTimeSlot || '').trim() || DEFAULT_AVAILABILITY_TIME_SLOT;

  return {
    daysAvailable: AVAILABILITY_DAYS.filter((day) => normalizedDaySet.has(day)),
    timeSlot: normalizedTimeSlot,
  };
};

// @desc    Get all faculty/staff
// @route   GET /api/faculty
// @access  Public
router.get('/', async (req, res) => {
  try {
    const filter = isAuthenticated(req) ? {} : { isActive: { $ne: false } };
    const faculty = await FacultyStaff.find(filter)
      .populate(PERSONNEL_POPULATE)
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
      .populate(PERSONNEL_POPULATE)
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
      .populate(PERSONNEL_POPULATE)
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
    const faculty = await FacultyStaff.findById(req.params.id).populate(PERSONNEL_POPULATE);
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
    let facultyData = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(facultyData, 'is_active')) {
      facultyData.isActive = Boolean(facultyData.is_active);
      delete facultyData.is_active;
    }
    facultyData = await normalizePersonnelPayload(facultyData);

    facultyData.availability = normalizeAvailability(
      {
        daysAvailable: facultyData.availability?.daysAvailable ?? facultyData.daysAvailable,
        timeSlot: facultyData.availability?.timeSlot ?? facultyData.timeSlot,
      },
      {}
    );
    delete facultyData.daysAvailable;
    delete facultyData.timeSlot;

    const faculty = await FacultyStaff.create(facultyData);
    await faculty.populate(PERSONNEL_POPULATE);
    await syncRecordIndexByType('Personnel', faculty._id);
    res.status(201).json(faculty);
  } catch (error) {
    sendRouteError(res, error);
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

    let updateData = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updateData, 'is_active')) {
      updateData.isActive = Boolean(updateData.is_active);
      delete updateData.is_active;
    }
    updateData = await normalizePersonnelPayload(updateData, faculty, req.params.id);

    const hasAvailabilityUpdate =
      Object.prototype.hasOwnProperty.call(updateData, 'availability') ||
      Object.prototype.hasOwnProperty.call(updateData, 'daysAvailable') ||
      Object.prototype.hasOwnProperty.call(updateData, 'timeSlot');

    if (hasAvailabilityUpdate) {
      updateData.availability = normalizeAvailability(
        {
          daysAvailable: updateData.availability?.daysAvailable ?? updateData.daysAvailable,
          timeSlot: updateData.availability?.timeSlot ?? updateData.timeSlot,
        },
        faculty.availability || {}
      );
    }
    delete updateData.daysAvailable;
    delete updateData.timeSlot;

    const updatedFaculty = await FacultyStaff.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate(PERSONNEL_POPULATE);
    await syncRecordIndexByType('Personnel', updatedFaculty?._id || req.params.id);
    res.json(updatedFaculty);
  } catch (error) {
    sendRouteError(res, error);
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
    await syncRecordDeactivationByType('Personnel', req.params.id, true);
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
    await syncRecordIndexByType('Personnel', req.params.id);
    await syncRecordDeactivationByType('Personnel', req.params.id, false);
    res.json({ message: 'Faculty/Staff reactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
