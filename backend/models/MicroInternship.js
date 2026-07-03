const mongoose = require('mongoose');

const BADGE_COLORS = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
const BADGE_ICONS  = ['⭐', '🏆', '🎯', '💡', '🔥', '🚀', '🛠️', '🌟', '🎓', '🥇'];

// ── Micro-Internship Task ─────────────────────────────────────────────────────
const microInternshipSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  description: { type: String, required: true },
  department:  { type: String, required: true },
  semester:    { type: Number, required: true },

  // Badge details awarded on completion
  badgeName:   { type: String, required: true },
  badgeIcon:   { type: String, default: '🏆' },
  badgeColor:  { type: String, default: '#7c3aed' },
  badgeCategory: {
    type: String,
    enum: ['Technical', 'Research', 'Leadership', 'Creative', 'Communication', 'Analytical', 'Other'],
    default: 'Technical'
  },

  // Task details
  skills:      [{ type: String }],          // tags e.g. ['Python', 'ML']
  duration:    { type: String },            // e.g. "2 weeks"
  deadline:    { type: Date },
  maxApplicants: { type: Number, default: 10 },

  // Posted by teacher / HOD
  postedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  status: {
    type: String,
    enum: ['open', 'in_progress', 'completed', 'cancelled'],
    default: 'open'
  },

  createdAt: { type: Date, default: Date.now }
});

// ── Application ───────────────────────────────────────────────────────────────
const internshipApplicationSchema = new mongoose.Schema({
  internship: { type: mongoose.Schema.Types.ObjectId, ref: 'MicroInternship', required: true },
  student:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  statement:  { type: String },             // why they want to apply

  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'completed'],
    default: 'pending'
  },

  // Teacher feedback on submission
  submission:     { type: String },         // link / text submission
  teacherFeedback:{ type: String },
  badgeAwarded:   { type: Boolean, default: false },

  appliedAt:   { type: Date, default: Date.now },
  completedAt: { type: Date }
});

// Prevent duplicate applications
internshipApplicationSchema.index({ internship: 1, student: 1 }, { unique: true });

// ── Digital Badge (awarded record) ────────────────────────────────────────────
const digitalBadgeSchema = new mongoose.Schema({
  student:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  awardedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  internship: { type: mongoose.Schema.Types.ObjectId, ref: 'MicroInternship' },
  application:{ type: mongoose.Schema.Types.ObjectId, ref: 'InternshipApplication' },

  name:       { type: String, required: true },
  icon:       { type: String, default: '🏆' },
  color:      { type: String, default: '#7c3aed' },
  category:   { type: String, default: 'Technical' },
  description:{ type: String },

  awardedAt:  { type: Date, default: Date.now }
});

const MicroInternship       = mongoose.model('MicroInternship',       microInternshipSchema);
const InternshipApplication = mongoose.model('InternshipApplication', internshipApplicationSchema);
const DigitalBadge          = mongoose.model('DigitalBadge',          digitalBadgeSchema);

module.exports = { MicroInternship, InternshipApplication, DigitalBadge, BADGE_COLORS, BADGE_ICONS };
