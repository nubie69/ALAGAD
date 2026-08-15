const express = require('express');
const jwt = require('jsonwebtoken');
const Resource = require('../models/Resource');
const FAQ = require('../models/FAQ');
const { protect, authorize } = require('../middleware/authMiddleware');
const { sanitizeResourceUrl, isSafeResourceUrl } = require('../utils/resourceUrl');
const { syncRecordIndexByType, syncRecordDeactivationByType } = require('../services/retrieval/indexSyncService');
const { normalizeStakeholders } = require('../services/retrieval/stakeholderUtils');

const router = express.Router();

const isAuthenticated = (req) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer')) return false;
    jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    return true;
  } catch {
    return false;
  }
};

const asIdList = (value) => {
  const raw = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(raw.map((item) => String(item || '').trim()).filter(Boolean)));
};

const normalizeResourcePayload = (body) => {
  const payload = { ...body };
  payload.title = String(payload.title || '').trim();
  payload.description = String(payload.description || '').trim();
  payload.type = String(payload.type || 'PDF').trim().toUpperCase();
  const stakeholders = normalizeStakeholders(payload.stakeholders || payload.stakeholder);
  payload.stakeholders = stakeholders;
  payload.stakeholder = stakeholders[0] || '';
  payload.category = String(payload.category || '').trim();
  payload.url = sanitizeResourceUrl(payload.url);
  payload.office = payload.office || payload.officeId || null;
  payload.department = payload.department || payload.departmentId || null;
  payload.faqs = asIdList(payload.faqs || payload.faqIds);
  payload.verified = Boolean(payload.verified);
  payload.isActive = Object.prototype.hasOwnProperty.call(payload, 'active')
    ? Boolean(payload.active)
    : (Object.prototype.hasOwnProperty.call(payload, 'isActive') ? Boolean(payload.isActive) : true);
  payload.lastVerified = payload.verified
    ? (payload.lastVerified ? new Date(payload.lastVerified) : new Date())
    : (payload.lastVerified || null);
  payload.verifiedBy = String(payload.verifiedBy || '').trim();
  payload.source = String(payload.source || '').trim();
  return payload;
};

const populateResource = (query) => query
  .populate('office', 'name department contactInfo')
  .populate('department', 'name code')
  .populate('faqs', 'question category verified isActive');

const syncFaqResourceLinks = async (resourceId, faqIds = []) => {
  const id = String(resourceId || '');
  if (!id) return;
  await FAQ.updateMany({ resources: id, _id: { $nin: faqIds } }, { $pull: { resources: id } });
  if (faqIds.length > 0) {
    await FAQ.updateMany({ _id: { $in: faqIds } }, { $addToSet: { resources: id } });
  }
};

router.get('/', async (req, res) => {
  try {
    const filter = isAuthenticated(req) ? {} : { isActive: { $ne: false }, verified: true };
    if (req.query.office) filter.office = req.query.office;
    if (req.query.department) filter.department = req.query.department;
    if (req.query.faq) filter.faqs = req.query.faq;
    const resources = await populateResource(Resource.find(filter)).sort({ title: 1 });
    res.json(resources.filter((resource) => isAuthenticated(req) || isSafeResourceUrl(resource.url)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const resource = await populateResource(Resource.findById(req.params.id));
    if (!resource) return res.status(404).json({ message: 'Resource not found' });
    if (!isAuthenticated(req) && (resource.isActive === false || resource.verified !== true || !isSafeResourceUrl(resource.url))) {
      return res.status(404).json({ message: 'Resource not found' });
    }
    res.json(resource);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    const payload = normalizeResourcePayload(req.body);
    if (!payload.title) return res.status(400).json({ message: 'Resource title is required.' });
    if (!payload.url) return res.status(400).json({ message: 'Resource URL is required.' });
    const resource = await Resource.create(payload);
    await syncFaqResourceLinks(resource._id, payload.faqs);
    await syncRecordIndexByType('Resource', resource._id);
    res.status(201).json(await populateResource(Resource.findById(resource._id)));
  } catch (error) {
    const status = error.code === 'INVALID_RESOURCE_URL' || error.code === 'UNSAFE_RESOURCE_URL' ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
});

router.put('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const existing = await Resource.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Resource not found' });
    const payload = normalizeResourcePayload(req.body);
    await Resource.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    await syncFaqResourceLinks(req.params.id, payload.faqs);
    if (payload.isActive === false || payload.verified !== true) {
      await syncRecordDeactivationByType('Resource', req.params.id, true);
    } else {
      await syncRecordIndexByType('Resource', req.params.id);
      await syncRecordDeactivationByType('Resource', req.params.id, false);
    }
    res.json(await populateResource(Resource.findById(req.params.id)));
  } catch (error) {
    const status = error.code === 'INVALID_RESOURCE_URL' || error.code === 'UNSAFE_RESOURCE_URL' ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
});

router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: 'Resource not found' });
    await Resource.findByIdAndUpdate(req.params.id, { isActive: false });
    await syncRecordDeactivationByType('Resource', req.params.id, true);
    res.json({ message: 'Resource deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id/reactivate', protect, authorize('super_admin'), async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: 'Resource not found' });
    await Resource.findByIdAndUpdate(req.params.id, { isActive: true });
    await syncRecordIndexByType('Resource', req.params.id);
    await syncRecordDeactivationByType('Resource', req.params.id, false);
    res.json({ message: 'Resource reactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
