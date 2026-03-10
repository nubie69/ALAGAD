const mongoose = require('mongoose');

const settingsSchema = mongoose.Schema(
  {
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    kioskStatus: {
      type: String,
      enum: ['online', 'offline', 'maintenance'],
      default: 'online',
    },
  },
  { timestamps: true }
);

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
