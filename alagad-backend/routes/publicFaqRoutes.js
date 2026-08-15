const express = require('express');
const FAQ = require('../models/FAQ');
const { isSafeResourceUrl } = require('../utils/resourceUrl');

const router = express.Router();

const toPublicFaq = (faq) => {
  const office = faq.office && typeof faq.office === 'object'
    ? {
      id: faq.office._id,
      _id: faq.office._id,
      name: faq.office.name,
      floor: faq.office.floor || null,
      building: faq.office.building && typeof faq.office.building === 'object'
        ? {
          id: faq.office.building._id,
          _id: faq.office.building._id,
          name: faq.office.building.name,
          geometry: faq.office.building.geometry || null,
          numberOfFloors: faq.office.building.numberOfFloors || null,
        }
        : null,
      room: faq.office.room || null,
      geometry: faq.office.geometry || null,
    }
    : null;

  const department = faq.department && typeof faq.department === 'object'
    ? {
      id: faq.department._id,
      _id: faq.department._id,
      name: faq.department.name,
      code: faq.department.code || '',
    }
    : null;

  const relatedFaqs = (Array.isArray(faq.relatedFaqs) ? faq.relatedFaqs : [])
    .filter((item) => item && item.verified === true && item.isActive !== false && !['draft', 'pending_review', 'archived'].includes(String(item.status || '').toLowerCase()))
    .map((item) => ({
      id: item._id,
      _id: item._id,
      name: String(item.name || item.question || '').trim(),
      question: String(item.name || item.question || '').trim(),
      category: String(item.category || '').trim(),
    }));

  const downloadableResources = [
    ...(Array.isArray(faq.downloadableResources) ? faq.downloadableResources : []),
    ...(Array.isArray(faq.resources) ? faq.resources : []),
  ]
    .filter((item) => item && (item.verified !== false) && item.isActive !== false && isSafeResourceUrl(item.url))
    .map((item) => {
      const title = String(item.title || item.name || '').trim();
      return {
        id: item._id,
        _id: item._id,
        title,
        name: title,
        description: String(item.description || '').trim(),
        type: String(item.type || 'PDF').trim(),
        url: String(item.url || '').trim(),
      };
    })
    .filter((item) => item.title && item.url);

  return {
    id: faq._id,
    name: String(faq.name || faq.question || '').trim(),
    question: String(faq.name || faq.question || '').trim(),
    verifiedAnswer: String(faq.verifiedAnswer || faq.answer || '').trim(),
    answer: String(faq.verifiedAnswer || faq.answer || '').trim(),
    category: String(faq.category || '').trim(),
    keywords: Array.isArray(faq.keywords) ? faq.keywords : [],
    alternativeQuestions: Array.isArray(faq.alternativeQuestions) ? faq.alternativeQuestions : [],
    office,
    department,
    relatedFaqs,
    resources: downloadableResources,
    downloadableResources,
    responsibleOffice: office?.name || department?.name || 'N/A',
    lastVerified: faq.lastVerified || null,
  };
};

router.get('/', async (req, res) => {
  try {
    const faqs = await FAQ.find({
      status: { $in: ['published', 'verified'] },
      verified: true,
      isActive: { $ne: false },
    })
      .select('question answer category keywords alternativeQuestions office department relatedFaqs resources downloadableResources lastVerified')
      .populate({
        path: 'office',
        select: 'name building room floor geometry isActive',
        match: { isActive: { $ne: false } },
        populate: [
          { path: 'building', select: 'name geometry numberOfFloors isActive', match: { isActive: { $ne: false } } },
          { path: 'room', select: 'name floor building geometry isActive', match: { isActive: { $ne: false } } },
        ],
      })
      .populate('department', 'name code active')
      .populate({
        path: 'relatedFaqs',
        select: 'question category verified isActive status',
        match: {
          status: { $in: ['published', 'verified'] },
          verified: true,
          isActive: { $ne: false },
        },
      })
      .populate({
        path: 'resources',
        select: 'title description type url verified isActive',
        match: {
          verified: true,
          isActive: { $ne: false },
        },
      })
      .sort({ question: 1 })
      .lean({ virtuals: true });

    res.json(faqs.map(toPublicFaq));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load public FAQs.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const faq = await FAQ.findOne({
      _id: req.params.id,
      status: { $in: ['published', 'verified'] },
      verified: true,
      isActive: { $ne: false },
    })
      .select('question answer category keywords alternativeQuestions office department relatedFaqs resources downloadableResources lastVerified')
      .populate({
        path: 'office',
        select: 'name building room floor geometry isActive',
        match: { isActive: { $ne: false } },
        populate: [
          { path: 'building', select: 'name geometry numberOfFloors isActive', match: { isActive: { $ne: false } } },
          { path: 'room', select: 'name floor building geometry isActive', match: { isActive: { $ne: false } } },
        ],
      })
      .populate('department', 'name code active')
      .populate({
        path: 'relatedFaqs',
        select: 'question category verified isActive status',
        match: {
          status: { $in: ['published', 'verified'] },
          verified: true,
          isActive: { $ne: false },
        },
      })
      .populate({
        path: 'resources',
        select: 'title description type url verified isActive',
        match: {
          verified: true,
          isActive: { $ne: false },
        },
      })
      .lean({ virtuals: true });

    if (!faq) return res.status(404).json({ message: 'FAQ not found' });

    res.json(toPublicFaq(faq));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load public FAQ.' });
  }
});

module.exports = router;
