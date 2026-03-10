const express = require('express');
const router = express.Router();
const Building = require('../models/Building');
const Office = require('../models/Office');
const { protect, authorize } = require('../middleware/authMiddleware');

// @desc    Get all map features as GeoJSON
// @route   GET /api/map/features
// @access  Public
router.get('/features', async (req, res) => {
  try {
    const activeFilter = { isActive: { $ne: false } };
    const buildings = await Building.find({ geometry: { $exists: true }, ...activeFilter });
    const offices = await Office.find({ geometry: { $exists: true }, ...activeFilter })
      .populate('building', 'name')
      .populate('room', 'name floor');

    const features = [];

    // Convert buildings to GeoJSON features
    buildings.forEach(building => {
      if (building.geometry) {
        features.push({
          type: 'Feature',
          properties: {
            id: building._id.toString(),
            type: 'building',
            name: building.name,
            description: building.description || '',
            location: building.location || '',
          },
          geometry: building.geometry,
        });
      }
    });

    // Convert offices to GeoJSON features
    offices.forEach(office => {
      if (office.geometry) {
        features.push({
          type: 'Feature',
          properties: {
            id: office._id.toString(),
            type: 'office',
            name: office.name,
            description: office.description || '',
            building: office.building?.name || '',
            floor: office.floor || '',
            contactInfo: office.contactInfo || '',
          },
          geometry: office.geometry,
        });
      }
    });

    res.json({
      type: 'FeatureCollection',
      features: features,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Save map feature (building or office)
// @route   POST /api/map/features
// @access  Private (Super Admin only)
router.post('/features', protect, authorize('super_admin'), async (req, res) => {
  try {
    const { type, properties, geometry } = req.body;

    if (type === 'building') {
      const building = await Building.findByIdAndUpdate(
        properties.id,
        {
          name: properties.name,
          description: properties.description,
          location: properties.location,
          geometry: geometry,
        },
        { new: true, upsert: false }
      );
      if (!building) {
        return res.status(404).json({ message: 'Building not found' });
      }
      res.json(building);
    } else if (type === 'office') {
      const office = await Office.findByIdAndUpdate(
        properties.id,
        {
          name: properties.name,
          description: properties.description,
          geometry: geometry,
        },
        { new: true, upsert: false }
      );
      if (!office) {
        return res.status(404).json({ message: 'Office not found' });
      }
      res.json(office);
    } else {
      res.status(400).json({ message: 'Invalid feature type' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create new map feature
// @route   POST /api/map/features/new
// @access  Private (Super Admin only)
router.post('/features/new', protect, authorize('super_admin'), async (req, res) => {
  try {
    const { type, properties, geometry } = req.body;
    const fallbackDepartment = req.user.department || 'Unassigned';

    if (type === 'building') {
      const building = await Building.create({
        name: properties.name,
        description: properties.description || '',
        location: properties.location || '',
        department: properties.department || fallbackDepartment,
        geometry: geometry,
      });
      res.status(201).json(building);
    } else if (type === 'office') {
      const office = await Office.create({
        name: properties.name,
        description: properties.description || '',
        building: properties.buildingId,
        room: properties.roomId,
        department: properties.department || fallbackDepartment,
        geometry: geometry,
      });
      await office.populate('building', 'name');
      await office.populate('room', 'name floor');
      res.status(201).json(office);
    } else {
      res.status(400).json({ message: 'Invalid feature type' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete map feature
// @route   DELETE /api/map/features/:id
// @access  Private (Super Admin only)
router.delete('/features/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const { type } = req.query;
    let result;

    if (type === 'building') {
      result = await Building.findByIdAndDelete(req.params.id);
    } else if (type === 'office') {
      result = await Office.findByIdAndDelete(req.params.id);
    } else {
      return res.status(400).json({ message: 'Invalid feature type' });
    }

    if (!result) {
      return res.status(404).json({ message: 'Feature not found' });
    }

    res.json({ message: 'Feature deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Set pin (geometry) on an existing building or office
// @route   PUT /api/map/features/:id/pin
// @access  Private (Super Admin only)
router.put('/features/:id/pin', protect, authorize('super_admin'), async (req, res) => {
  try {
    const { type, geometry } = req.body;

    if (!geometry || !geometry.type || !geometry.coordinates) {
      return res.status(400).json({ message: 'Valid geometry is required' });
    }

    let result;
    if (type === 'building') {
      result = await Building.findByIdAndUpdate(
        req.params.id,
        { geometry },
        { new: true }
      );
    } else if (type === 'office') {
      result = await Office.findByIdAndUpdate(
        req.params.id,
        { geometry },
        { new: true }
      );
      if (result) {
        await result.populate('building', 'name');
      }
    } else {
      return res.status(400).json({ message: 'Invalid type. Must be "building" or "office"' });
    }

    if (!result) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Remove pin (geometry) from a building or office
// @route   DELETE /api/map/features/:id/pin
// @access  Private (Super Admin only)
router.delete('/features/:id/pin', protect, authorize('super_admin'), async (req, res) => {
  try {
    const { type } = req.query;

    let result;
    if (type === 'building') {
      result = await Building.findByIdAndUpdate(
        req.params.id,
        { $unset: { geometry: 1 } },
        { new: true }
      );
    } else if (type === 'office') {
      result = await Office.findByIdAndUpdate(
        req.params.id,
        { $unset: { geometry: 1 } },
        { new: true }
      );
    } else {
      return res.status(400).json({ message: 'Invalid type. Must be "building" or "office"' });
    }

    if (!result) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json({ message: 'Pin removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
