const mongoose = require('mongoose');

const buildingSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
    },
    image: {
      type: String,
    },
    numberOfFloors: {
      type: Number,
      min: 1,
    },
    department: {
      type: String,
      required: false,
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
      default: '#3b82f6',
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

const Building = mongoose.model('Building', buildingSchema);

module.exports = Building;
