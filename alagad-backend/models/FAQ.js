const mongoose = require('mongoose');
const { sanitizeResourceUrl } = require('../utils/resourceUrl');

const FAQ_STATUSES = ['draft', 'pending_review', 'pending_verification', 'published', 'archived', 'verified', 'rejected'];

const downloadableResourceSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          sanitizeResourceUrl(value);
          return true;
        },
        message: 'Downloadable resource URL must be a valid HTTP or HTTPS URL.',
      },
    },
    type: {
      type: String,
      default: 'PDF',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false }
);

const faqSchema = mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
      index: true,
      alias: 'name',
    },
    answer: {
      type: String,
      required: true,
      trim: true,
      alias: 'verifiedAnswer',
    },
    category: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    stakeholder: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    stakeholders: {
      type: [String],
      default: [],
      index: true,
    },
    keywords: {
      type: [String],
      default: [],
    },
    alternativeQuestions: {
      type: [String],
      default: [],
    },
    language: {
      type: String,
      default: 'english',
      trim: true,
      index: true,
    },
    office: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Office',
      default: null,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    status: {
      type: String,
      enum: FAQ_STATUSES,
      default: 'published',
      index: true,
    },
    embedding: {
      type: [Number],
      default: [],
      select: false,
    },
    embeddingModel: {
      type: String,
      default: '',
      trim: true,
      select: false,
    },
    embeddingUpdatedAt: {
      type: Date,
      default: null,
      select: false,
    },
    relatedFaqs: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FAQ',
    }],
    resources: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
    }],
    downloadableResources: {
      type: [downloadableResourceSchema],
      default: [],
    },
    relatedService: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null,
    },
    verified: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastVerified: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: String,
      default: '',
      trim: true,
    },
    source: {
      type: String,
      default: '',
      trim: true,
    },
    effectiveDate: {
      type: Date,
      default: null,
    },
    expirationDate: {
      type: Date,
      default: null,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    last_indexed: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

faqSchema.pre('validate', function normalizeFaq() {
  this.question = String(this.question || this.name || '').trim();
  this.answer = String(this.answer || this.verifiedAnswer || '').trim();
  this.keywords = Array.from(new Set((this.keywords || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)));
  this.alternativeQuestions = Array.from(new Set((this.alternativeQuestions || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)));
  this.relatedFaqs = Array.from(new Set((this.relatedFaqs || [])
    .map((item) => String(item || ''))
    .filter((item) => item && item !== String(this._id || ''))));
  this.resources = Array.from(new Set((this.resources || []).map((item) => String(item))));
  this.downloadableResources = (this.downloadableResources || [])
    .map((item) => ({
      name: String(item?.name || item?.title || '').trim(),
      url: sanitizeResourceUrl(item?.url),
      type: String(item?.type || 'PDF').trim(),
      description: String(item?.description || '').trim(),
    }))
    .filter((item) => item.name && item.url);
  if (!FAQ_STATUSES.includes(this.status)) {
    this.status = this.verified ? 'published' : 'draft';
  }
  const stakeholderList = Array.from(new Set((Array.isArray(this.stakeholders) ? this.stakeholders : String(this.stakeholders || '').split(/[;,]/))
    .map((item) => String(item || '').trim().toLowerCase().replace(/[\s-]+/g, '_'))
    .filter(Boolean)));
  const singleStakeholder = String(this.stakeholder || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (singleStakeholder && !stakeholderList.includes(singleStakeholder)) {
    stakeholderList.unshift(singleStakeholder);
  }
  this.stakeholders = stakeholderList;
  this.stakeholder = stakeholderList[0] || '';
  if (this.verified && !this.lastVerified) {
    this.lastVerified = new Date();
  }
});

const FAQ = mongoose.model('FAQ', faqSchema);

FAQ.STATUSES = FAQ_STATUSES;

module.exports = FAQ;
