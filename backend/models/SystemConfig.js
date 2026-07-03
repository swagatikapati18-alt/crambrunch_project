const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  grievanceResolutionDays: { type: Number, default: 7 }, // SLA in days
  holidays: [{
    name: { type: String, required: true },
    date: { type: Date, required: true }
  }],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
