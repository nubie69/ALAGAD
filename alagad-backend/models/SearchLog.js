const mongoose = require('mongoose');

const searchLogSchema = new mongoose.Schema(
  {
    locationId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: 'search_logs',
    versionKey: false,
  }
);

module.exports = mongoose.model('SearchLog', searchLogSchema);
