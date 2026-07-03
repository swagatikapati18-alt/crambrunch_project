const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  hod: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  courses: [{
    name: { type: String, required: true },
    durationYears: { type: Number, required: true },
    // Backwards-compatible: simple subjects array OR structured years/semesters
    subjects: [{ type: String }],
    years: [{
      yearNumber: { type: Number },
      semesters: [{
        semNumber: { type: Number },
        subjects: [{ type: String }]
      }]
    }]
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Department', departmentSchema);
