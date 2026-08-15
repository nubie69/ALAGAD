const mongoose = require('mongoose');
const { sanitizeResourceUrl } = require('../utils/resourceUrl');

const RESOURCE_TYPES = [
  'PDF',
  'DOC',
  'DOCX',
  'FORM',
  'REQUIREMENTS',
  'GUIDE',
  'OFFICIAL WEBSITE',
  'OTHER',
];

const resourceSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    type: {
      type: String,
      enum: RESOURCE_TYPES,
      default: 'PDF',
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
    category: {
      type: String,
      default: '',
      trim: true,
      index: true,
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
        message: 'Resource URL must be a valid HTTP or HTTPS URL.',
      },
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
    faqs: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FAQ',
    }],
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

resourceSchema.pre('validate', function normalizeResource(next) {
  if (this.url) {
    this.url = sanitizeResourceUrl(this.url);
  }
  this.faqs = Array.from(new Set((this.faqs || []).map((item) => String(item))));
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
  next();
});

resourceSchema.statics.RESOURCE_TYPES = RESOURCE_TYPES;

const Resource = mongoose.model('Resource', resourceSchema);

module.exports = Resource;
