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
    helpDesk: {
      phone: {
        type: String,
        default: '',
        trim: true,
      },
      email: {
        type: String,
        default: '',
        trim: true,
      },
      officeLocation: {
        type: String,
        default: '',
        trim: true,
      },
      officialLink: {
        type: String,
        default: '',
        trim: true,
      },
    },
  },
  { timestamps: true }
);

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
