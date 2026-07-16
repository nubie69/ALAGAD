const express = require('express');
const SearchLog = require('../models/SearchLog');

const router = express.Router();

// Log anonymous location interactions (search/click).
router.post('/log', async (req, res) => {
  try {
    const locationId = String(req.body?.locationId || '').trim();
    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required' });
    }

    await SearchLog.create({
      locationId,
      timestamp: new Date(),
    });

    return res.status(201).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save search log' });
  }
});

// Get top 5 most visited locationIds.
router.get('/', async (_req, res) => {
  try {
    const popular = await SearchLog.aggregate([
      {
        $group: {
          _id: '$locationId',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          locationId: '$_id',
          count: 1,
        },
      },
    ]);

    return res.json(popular);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch popular locations' });
  }
});

module.exports = router;
