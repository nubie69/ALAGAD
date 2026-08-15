const express = require('express');
const jwt = require('jsonwebtoken');
const FAQ = require('../models/FAQ');
const Resource = require('../models/Resource');
const { protect, authorize } = require('../middleware/authMiddleware');
const { sanitizeResourceUrl, isSafeResourceUrl } = require('../utils/resourceUrl');
const { syncRecordIndexByType, syncRecordDeactivationByType } = require('../services/retrieval/indexSyncService');
const { normalizeStakeholders } = require('../services/retrieval/stakeholderUtils');
const {
  attachFaqEmbedding,
  migrateMissingFaqEmbeddings,
  searchVerifiedFaqs,
} = require('../services/faqSemanticRetrieval');

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

const asStringList = (value) => {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\n;,]/);
  return Array.from(new Set(raw.map((item) => String(item || '').trim()).filter(Boolean)));
};

const normalizeFaqStatus = (value, verified = true) => {
  const status = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['draft', 'pending_review', 'published', 'archived', 'verified'].includes(status)) return status;
  return verified ? 'published' : 'draft';
};

const serializeDownloadableResource = (resource) => {
  if (!resource) return null;
  const title = String(resource.title || resource.name || '').trim();
  const url = String(resource.url || '').trim();
  if (!title || !isSafeResourceUrl(url)) return null;
  return {
    id: resource._id ? String(resource._id) : undefined,
    title,
    name: title,
    url,
    type: String(resource.type || 'PDF').trim(),
    description: String(resource.description || '').trim(),
  };
};

const normalizeDownloadableResources = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const name = String(item?.name || item?.title || '').trim();
      const rawUrl = String(item?.url || '').trim();
      if (!name && !rawUrl) return null;
      if (!name) {
        const error = new Error('Downloadable resource name is required when adding a resource.');
        error.code = 'INVALID_RESOURCE_URL';
        throw error;
      }
      if (!rawUrl) {
        const error = new Error('Downloadable resource URL is required when adding a resource.');
        error.code = 'INVALID_RESOURCE_URL';
        throw error;
      }
      return {
        name,
        url: sanitizeResourceUrl(rawUrl),
        type: String(item?.type || 'PDF').trim(),
        description: String(item?.description || '').trim(),
      };
    })
    .filter(Boolean);
};

const toFaqResponse = (faqDoc) => {
  if (!faqDoc) return null;

  const office = faqDoc.office && typeof faqDoc.office === 'object'
    ? faqDoc.office
    : (faqDoc.office || null);
  const department = faqDoc.department && typeof faqDoc.department === 'object'
    ? faqDoc.department
    : (faqDoc.department || null);

  return {
    _id: faqDoc._id,
    id: faqDoc._id,
    name: String(faqDoc.name || faqDoc.question || '').trim(),
    verifiedAnswer: String(faqDoc.verifiedAnswer || faqDoc.answer || '').trim(),
    office,
    department,
    verified: faqDoc.verified === true,
    isActive: faqDoc.isActive !== false,
    lastVerified: faqDoc.lastVerified || null,
    updatedAt: faqDoc.updatedAt || null,
    createdAt: faqDoc.createdAt || null,
    status: faqDoc.status || 'published',
    question: String(faqDoc.name || faqDoc.question || '').trim(),
    answer: String(faqDoc.verifiedAnswer || faqDoc.answer || '').trim(),
    category: String(faqDoc.category || '').trim(),
    keywords: Array.isArray(faqDoc.keywords) ? faqDoc.keywords : [],
    alternativeQuestions: Array.isArray(faqDoc.alternativeQuestions) ? faqDoc.alternativeQuestions : [],
    language: String(faqDoc.language || 'english').trim(),
    relatedFaqs: Array.isArray(faqDoc.relatedFaqs) ? faqDoc.relatedFaqs : [],
    resources: Array.isArray(faqDoc.resources) ? faqDoc.resources : [],
    downloadableResources: [
      ...(Array.isArray(faqDoc.downloadableResources) ? faqDoc.downloadableResources : []),
      ...(Array.isArray(faqDoc.resources) ? faqDoc.resources : []),
    ].map(serializeDownloadableResource).filter(Boolean),
    relatedService: faqDoc.relatedService || null,
    verifiedBy: String(faqDoc.verifiedBy || '').trim(),
    source: String(faqDoc.source || '').trim(),
  };
};

const normalizeFaqPayload = (body, existing = null) => {
  const payload = { ...body };
  const hasQuestion = Object.prototype.hasOwnProperty.call(payload, 'name')
    || Object.prototype.hasOwnProperty.call(payload, 'question');
  const hasAnswer = Object.prototype.hasOwnProperty.call(payload, 'verifiedAnswer')
    || Object.prototype.hasOwnProperty.call(payload, 'answer');

  payload.question = hasQuestion
    ? String(payload.name || payload.question || '').trim()
    : String(existing?.question || existing?.name || '').trim();
  payload.answer = hasAnswer
    ? String(payload.verifiedAnswer || payload.answer || '').trim()
    : String(existing?.answer || existing?.verifiedAnswer || '').trim();
  payload.name = payload.question;
  payload.verifiedAnswer = payload.answer;
  payload.office = Object.prototype.hasOwnProperty.call(payload, 'office') || Object.prototype.hasOwnProperty.call(payload, 'officeId')
    ? (payload.office || payload.officeId || null)
    : (existing?.office || null);
  payload.department = Object.prototype.hasOwnProperty.call(payload, 'department') || Object.prototype.hasOwnProperty.call(payload, 'departmentId')
    ? (payload.department || payload.departmentId || null)
    : (existing?.department || null);
  const hasRelatedFaqs = Object.prototype.hasOwnProperty.call(payload, 'relatedFaqs')
    || Object.prototype.hasOwnProperty.call(payload, 'relatedFaqIds');
  const hasResources = Object.prototype.hasOwnProperty.call(payload, 'resources')
    || Object.prototype.hasOwnProperty.call(payload, 'resourceIds')
    || Object.prototype.hasOwnProperty.call(payload, 'downloadableResourceIds');
  payload.relatedFaqs = (hasRelatedFaqs
    ? asIdList(payload.relatedFaqs || payload.relatedFaqIds)
    : asIdList(existing?.relatedFaqs))
    .filter((id) => id !== String(payload._id || ''));
  payload.resources = hasResources
    ? asIdList(payload.resources || payload.resourceIds || payload.downloadableResourceIds)
    : asIdList(existing?.resources);
  payload.category = String(payload.category ?? existing?.category ?? '').trim();
  payload.keywords = Object.prototype.hasOwnProperty.call(payload, 'keywords')
    ? asStringList(payload.keywords)
    : asStringList(existing?.keywords);
  payload.alternativeQuestions = Object.prototype.hasOwnProperty.call(payload, 'alternativeQuestions')
    ? asStringList(payload.alternativeQuestions)
    : asStringList(existing?.alternativeQuestions);
  payload.downloadableResources = Object.prototype.hasOwnProperty.call(payload, 'downloadableResources')
    ? normalizeDownloadableResources(payload.downloadableResources)
    : (Array.isArray(existing?.downloadableResources) ? existing.downloadableResources : []);
  payload.language = String(payload.language || existing?.language || 'english').trim();
  payload.relatedService = payload.relatedService || payload.service || payload.serviceId || existing?.relatedService || null;
  payload.stakeholders = normalizeStakeholders(payload.stakeholders || payload.stakeholder);
  payload.stakeholder = payload.stakeholders[0] || '';
  payload.verified = Object.prototype.hasOwnProperty.call(payload, 'verified')
    ? Boolean(payload.verified)
    : true;
  payload.status = normalizeFaqStatus(payload.status ?? existing?.status, payload.verified);
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

const populateFaq = (query) => query
  .populate('office', 'name department contactInfo')
  .populate('department', 'name code')
  .populate('relatedFaqs', 'question category verified isActive status')
  .populate('resources', 'title description type url verified isActive')
  .populate('relatedService', 'name verificationStatus isActive');

const syncResourceFaqLinks = async (faqId, resourceIds = []) => {
  const id = String(faqId || '');
  if (!id) return;
  await Resource.updateMany({ faqs: id, _id: { $nin: resourceIds } }, { $pull: { faqs: id } });
  if (resourceIds.length > 0) {
    await Resource.updateMany({ _id: { $in: resourceIds } }, { $addToSet: { faqs: id } });
  }
};

router.get('/', async (req, res) => {
  try {
    const filter = isAuthenticated(req) ? {} : { isActive: { $ne: false }, verified: true };
    if (req.query.office) filter.office = req.query.office;
    if (req.query.department) filter.department = req.query.department;
    const faqs = await populateFaq(FAQ.find(filter)).sort({ question: 1 });
    res.json(faqs.map(toFaqResponse));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/related', async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id).select('relatedFaqs').lean();
    if (!faq) return res.status(404).json({ message: 'FAQ not found' });
    const related = await populateFaq(FAQ.find({
      _id: { $in: faq.relatedFaqs || [] },
      isActive: { $ne: false },
      verified: true,
      status: { $in: ['published', 'verified'] },
    })).sort({ question: 1 });
    res.json(related.map(toFaqResponse));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/resources', async (req, res) => {
  try {
    const resources = await Resource.find({
      faqs: req.params.id,
      isActive: { $ne: false },
      verified: true,
    })
      .populate('office', 'name department contactInfo')
      .populate('department', 'name code')
      .sort({ title: 1 });
    res.json(resources);
  } catch (error) {
    const status = error.code === 'INVALID_RESOURCE_URL' || error.code === 'UNSAFE_RESOURCE_URL' ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
});

router.post('/search', async (req, res) => {
  try {
    const query = String(req.body?.query || req.body?.message || '').trim();
    if (!query) return res.status(400).json({ message: 'Search query is required.' });
    const result = await searchVerifiedFaqs(query);
    res.json({
      matched: result.matched,
      faq: result.faq,
      topResults: result.topResults,
      threshold: result.threshold,
      searchMode: result.searchMode,
    });
  } catch (error) {
    const status = error.code === 'INVALID_RESOURCE_URL' || error.code === 'UNSAFE_RESOURCE_URL' ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
});

router.post('/migrate-embeddings', protect, authorize('super_admin'), async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true || String(req.query?.dryRun || '').toLowerCase() === 'true';
    const result = await migrateMissingFaqEmbeddings({ dryRun });
    res.json({
      message: dryRun
        ? 'FAQ embedding migration dry run completed.'
        : 'FAQ embedding migration completed.',
      ...result,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const faq = await populateFaq(FAQ.findById(req.params.id));
    if (!faq) return res.status(404).json({ message: 'FAQ not found' });
    if (!isAuthenticated(req) && (faq.isActive === false || faq.verified !== true)) {
      return res.status(404).json({ message: 'FAQ not found' });
    }
    res.json(toFaqResponse(faq));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    let payload = normalizeFaqPayload(req.body);
    if (!payload.question) return res.status(400).json({ message: 'FAQ name / question is required.' });
    if (!payload.answer) return res.status(400).json({ message: 'Verified answer is required.' });
    payload = await attachFaqEmbedding(payload);
    const faq = await FAQ.create(payload);
    await syncResourceFaqLinks(faq._id, payload.resources);
    await syncRecordIndexByType('FAQ', faq._id);
    res.status(201).json(toFaqResponse(await populateFaq(FAQ.findById(faq._id))));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const existing = await FAQ.findById(req.params.id).select('+embedding +embeddingModel +embeddingUpdatedAt');
    if (!existing) return res.status(404).json({ message: 'FAQ not found' });
    let payload = normalizeFaqPayload({ ...req.body, _id: req.params.id }, existing);
    if (!payload.question) return res.status(400).json({ message: 'FAQ name / question is required.' });
    if (!payload.answer) return res.status(400).json({ message: 'Verified answer is required.' });
    const questionChanged = String(existing.question || '').trim() !== payload.question;
    const semanticFieldsChanged = questionChanged
      || JSON.stringify(asStringList(existing.keywords)) !== JSON.stringify(payload.keywords)
      || JSON.stringify(asStringList(existing.alternativeQuestions)) !== JSON.stringify(payload.alternativeQuestions)
      || String(existing.category || '').trim() !== payload.category;
    const hasExistingEmbedding = Array.isArray(existing.embedding) && existing.embedding.length > 0;
    if (semanticFieldsChanged || !hasExistingEmbedding) {
      payload = await attachFaqEmbedding(payload);
    }
    const faq = await FAQ.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    await syncResourceFaqLinks(req.params.id, payload.resources);
    if (faq.isActive === false || faq.verified !== true || faq.status === 'archived' || faq.status === 'draft' || faq.status === 'pending_review') {
      await syncRecordDeactivationByType('FAQ', req.params.id, true);
    } else {
      await syncRecordIndexByType('FAQ', req.params.id);
      await syncRecordDeactivationByType('FAQ', req.params.id, false);
    }
    res.json(toFaqResponse(await populateFaq(FAQ.findById(req.params.id))));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) return res.status(404).json({ message: 'FAQ not found' });
    await FAQ.findByIdAndUpdate(req.params.id, { isActive: false });
    await FAQ.updateMany({ relatedFaqs: req.params.id }, { $pull: { relatedFaqs: req.params.id } });
    await Resource.updateMany({ faqs: req.params.id }, { $pull: { faqs: req.params.id } });
    await syncRecordDeactivationByType('FAQ', req.params.id, true);
    res.json({ message: 'FAQ deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id/reactivate', protect, authorize('super_admin'), async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) return res.status(404).json({ message: 'FAQ not found' });
    await FAQ.findByIdAndUpdate(req.params.id, { isActive: true });
    await syncRecordIndexByType('FAQ', req.params.id);
    await syncRecordDeactivationByType('FAQ', req.params.id, false);
    res.json({ message: 'FAQ reactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
