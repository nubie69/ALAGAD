const mongoose = require('mongoose');

const serviceSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
    },
    steps: {
      type: [String],
      default: [],
    },
    requirements: {
      type: [String],
      default: [],
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
    deadline: {
      type: String,
      default: '',
      trim: true,
    },
    processingTime: {
      type: String,
      default: '',
      trim: true,
    },
    department: {
      type: String,
      default: null,
      trim: true,
    },
    office: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Office',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    verificationStatus: {
      type: String,
      enum: ['draft', 'pending_verification', 'pending_review', 'verified', 'unverified', 'rejected', 'archived', 'outdated', 'conflicting'],
      default: 'verified',
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'pending_verification', 'pending_review', 'verified', 'unverified', 'rejected', 'archived', 'outdated', 'conflicting'],
      default: 'verified',
      index: true,
    },
    verifiedBy: {
      type: String,
      default: '',
      trim: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    sourceOffice: {
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
    last_indexed: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

serviceSchema.pre('validate', function normalizeServiceKnowledge(next) {
  const normalizeList = (value) => Array.from(new Set((Array.isArray(value) ? value : String(value || '').split(/[;,]/))
    .map((item) => String(item || '').trim().toLowerCase().replace(/[\s-]+/g, '_'))
    .filter(Boolean)));

  const stakeholderList = normalizeList(this.stakeholders);
  const singleStakeholder = String(this.stakeholder || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (singleStakeholder && !stakeholderList.includes(singleStakeholder)) {
    stakeholderList.unshift(singleStakeholder);
  }
  this.stakeholders = stakeholderList;
  this.stakeholder = stakeholderList[0] || '';
  this.verificationStatus = String(this.verificationStatus || this.status || 'verified').trim().toLowerCase().replace(/[\s-]+/g, '_');
  this.status = String(this.status || this.verificationStatus || 'verified').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (this.verificationStatus === 'verified' && !this.verifiedAt) {
    this.verifiedAt = new Date();
  }
  next();
});

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
