const mongoose = require('mongoose');

// Study Material
const materialSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, required: true },
  fileUrl: { type: String },
  fileType: { type: String, enum: ['notes', 'assignment', 'pyq', 'circular', 'other'] },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  department: { type: String },
  semester: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

  console.log('--- SkillTask Schema Loaded ---');
  const skillTaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  category: { type: String },
  skillOffered: { type: String },
  skillWanted: { type: String },
  type: { type: String, enum: ['skill_barter', 'skill_swap', 'micro_internship'], default: 'skill_swap' },
  applicants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['open', 'in_progress', 'completed'], default: 'open' },
  badgeAwarded: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Notification
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['attendance', 'marks', 'grievance', 'skill', 'general', 'warning'], default: 'general' },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Timetable Entry
const timetableSchema = new mongoose.Schema({
  department: { type: String, required: true },
  semester: { type: Number, required: true },
  day: { type: String, enum: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], required: true },
  slot: { type: String, required: true },
  subject: { type: String, required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  room: { type: String },
  substitutionStatus: {
    type: String,
    enum: ['none', 'open', 'claimed'],
    default: 'none'
  },
  substitutionRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  substitutionOpenedAt: { type: Date },
  substitutionReason: { type: String, trim: true },
  substituteTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  substitutionClaimedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// Extra Class Request
const extraClassSchema = new mongoose.Schema({
  department: { type: String, required: true },
  semester: { type: Number, required: true },
  day: { type: String, enum: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], required: true },
  slot: { type: String, required: true },
  subject: { type: String, required: true },
  room: { type: String },
  reason: { type: String, trim: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectionReason: { type: String, trim: true },
  originalTeacherUnavailableAt: { type: Date },
  substituteTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  substituteClaimedAt: { type: Date },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'open_for_claim', 'claimed', 'cancelled'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

// Feedback
const feedbackSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String },
  semester: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

module.exports = {
  Material: mongoose.model('Material', materialSchema),
  SkillTask: mongoose.model('SkillTask', skillTaskSchema),
  Notification: mongoose.model('Notification', notificationSchema),
  Timetable: mongoose.model('Timetable', timetableSchema),
  ExtraClass: mongoose.model('ExtraClass', extraClassSchema),
  Feedback: mongoose.model('Feedback', feedbackSchema)
};
