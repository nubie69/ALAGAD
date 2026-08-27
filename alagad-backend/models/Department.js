const mongoose = require('mongoose');

const departmentSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    organizationalChart: {
      data: { type: String },
      fileName: { type: String, trim: true },
      mimeType: { type: String, enum: ['image/png', 'image/jpeg', 'application/pdf'] },
      updatedAt: { type: Date },
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
    },
    floor: {
      type: Number,
    },
    active: {
      type: Boolean,
      default: true,
    },
    last_indexed: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const Department = mongoose.model('Department', departmentSchema);

module.exports = Department;
