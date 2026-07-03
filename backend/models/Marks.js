const mongoose = require('mongoose');

const marksSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  examType: { type: String, enum: ['internal', 'practical', 'assignment', 'semester'], required: true },
  marksObtained: { type: Number, required: true },
  totalMarks: { type: Number, required: true },
  semester: { type: Number, required: true },
  remarks: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Marks', marksSchema);
