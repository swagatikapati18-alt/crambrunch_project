const mongoose = require('mongoose');

const grievanceSchema = new mongoose.Schema({
  ticketId: { type: String, unique: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isAnonymous: { type: Boolean, default: false },
  department: { type: String, required: true, trim: true },
  category: { 
    type: String, 
    enum: ['infrastructure', 'academic', 'faculty', 'administration', 'other'],
    required: true 
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['open', 'in_progress', 'escalated', 'resolved', 'closed'],
    default: 'open'
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  escalatedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  escalatedAt: { type: Date },
  anonymousIdentityRevealedAt: { type: Date },
  resolvedAt: { type: Date },
  lastActivityAt: { type: Date, default: Date.now },
  comments: [{
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

// Auto-generate ticket ID
grievanceSchema.pre('save', function(next) {
  if (!this.ticketId) {
    this.ticketId = 'GRV-' + Date.now().toString(36).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Grievance', grievanceSchema);
