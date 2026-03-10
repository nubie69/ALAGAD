const express = require('express');
const router = express.Router();
const Building = require('../models/Building');
const Room = require('../models/Room');
const Office = require('../models/Office');
const FacultyStaff = require('../models/FacultyStaff');
const Service = require('../models/Service');
const Department = require('../models/Department');
const Settings = require('../models/Settings');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/authMiddleware');

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

const getOrCreateSettings = async () => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
};

// @desc    Get system overview metrics
// @route   GET /api/overview
// @access  Private (Super Admin only)
router.get('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    await ensureDefaultDepartments();
    const settings = await getOrCreateSettings();

    const [
      buildingsCount,
      roomsCount,
      officesCount,
      facultyCount,
      servicesCount,
      departmentsCount,
    ] = await Promise.all([
      Building.countDocuments(),
      Room.countDocuments(),
      Office.countDocuments(),
      FacultyStaff.countDocuments(),
      Service.countDocuments(),
      Department.countDocuments({ active: true }),
    ]);

    const topBuildings = await Building.aggregate([
      {
        $lookup: {
          from: 'rooms',
          localField: '_id',
          foreignField: 'building',
          as: 'rooms',
        },
      },
      {
        $lookup: {
          from: 'offices',
          localField: '_id',
          foreignField: 'building',
          as: 'offices',
        },
      },
      {
        $addFields: {
          roomCount: { $size: '$rooms' },
          officeCount: { $size: '$offices' },
        },
      },
      {
        $addFields: {
          totalLocations: { $add: ['$roomCount', '$officeCount'] },
        },
      },
      { $sort: { totalLocations: -1, name: 1 } },
      { $limit: 5 },
      {
        $project: {
          name: 1,
          roomCount: 1,
          officeCount: 1,
          totalLocations: 1,
        },
      },
    ]);

    res.json({
      counts: {
        buildings: buildingsCount,
        rooms: roomsCount,
        offices: officesCount,
        faculty: facultyCount,
        services: servicesCount,
        departments: departmentsCount,
      },
      kioskStatus: settings.kioskStatus,
      maintenanceMode: settings.maintenanceMode,
      topBuildings,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
