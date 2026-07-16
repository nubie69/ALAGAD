const mongoose = require('mongoose');

const officeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      default: null,
    },
    floor: {
      type: Number,
      default: null,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
    },
    contactInfo: {
      type: String,
    },
    services: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
      },
    ],
    description: {
      type: String,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    geometry: {
      type: {
        type: String,
        enum: ['Point', 'Polygon', 'LineString'],
      },
      coordinates: {
        type: mongoose.Schema.Types.Mixed,
      },
    },
    markerColor: {
      type: String,
      default: '#8b5cf6',
    },
    color: {
      type: String,
    },
    rotation: {
      type: Number,
      default: 0,
    },
    isActive: {
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

const Office = mongoose.model('Office', officeSchema);

module.exports = Office;
