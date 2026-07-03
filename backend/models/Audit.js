const mongoose = require('mongoose');

const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'CREATE_USER',
  'UPDATE_USER',
  'DELETE_USER',
  'APPROVE_STUDENT',
  'REJECT_STUDENT',
  'CREATE_TEACHER',
  'CREATE_HOD',
  'TOGGLE_USER_STATUS',
  'PASSWORD_RESET',
  'EMAIL_VERIFICATION',
  'PROFILE_UPDATE',
  'ATTENDANCE_MARKED',
  'MARKS_UPDATED',
  'GRIEVANCE_SUBMITTED',
  'GRIEVANCE_RESOLVED',
  'MATERIAL_UPLOADED',
  'NOTIFICATION_SENT',
  'TIMETABLE_UPDATED',
  'FEEDBACK_SUBMITTED',
  'SKILLHUB_ACCESS',
  'SYSTEM_CONFIG_CHANGE',
  'AUDIT_LOG_VIEWED',
  'AUDIT_LOG_EXPORTED',
  'CREATE_DEPARTMENT',
  'UPDATE_DEPARTMENT',
  'DELETE_DEPARTMENT'
];

const AUDIT_RESOURCE_TYPES = [
  'USER',
  'STUDENT',
  'TEACHER',
  'HOD',
  'ATTENDANCE',
  'MARKS',
  'GRIEVANCE',
  'MATERIAL',
  'NOTIFICATION',
  'TIMETABLE',
  'FEEDBACK',
  'SYSTEM',
  'AUTH',
  'AUDIT',
  'DEPARTMENT'
];

const auditSchema = new mongoose.Schema({
  // Who performed the action
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    required: true,
    enum: ['super_admin', 'hod', 'teacher', 'student', 'parent']
  },

  // What action was performed
  action: {
    type: String,
    required: true,
    enum: AUDIT_ACTIONS
  },

  // What resource was affected
  resourceType: {
    type: String,
    required: true,
    enum: AUDIT_RESOURCE_TYPES
  },

  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false // Some actions might not have a specific resource ID
  },

  // Details of the action
  description: {
    type: String,
    required: true
  },

  // Before/After data for changes (optional)
  oldValues: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  newValues: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // Metadata
  ipAddress: {
    type: String,
    default: null
  },

  userAgent: {
    type: String,
    default: null
  },

  // Additional context
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Timestamp (immutable)
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, {
  timestamps: false, // We use our own timestamp field
  collection: 'audit_logs'
});

// Indexes for efficient querying
auditSchema.index({ userId: 1, timestamp: -1 });
auditSchema.index({ action: 1, timestamp: -1 });
auditSchema.index({ resourceType: 1, timestamp: -1 });
auditSchema.index({ timestamp: -1 });
auditSchema.index({ userEmail: 1 });

// Prevent any updates or deletes on audit logs
auditSchema.pre('save', function(next) {
  if (!this.isNew) {
    return next(new Error('Audit logs cannot be modified'));
  }
  next();
});

function blockMutation(next) {
  next(new Error('Audit logs are immutable and cannot be modified or deleted'));
}

[
  'updateOne',
  'updateMany',
  'replaceOne',
  'findOneAndUpdate',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
  'findOneAndRemove'
].forEach(operation => {
  auditSchema.pre(operation, blockMutation);
});

auditSchema.pre('remove', blockMutation);

auditSchema.statics.ACTIONS = AUDIT_ACTIONS;
auditSchema.statics.RESOURCE_TYPES = AUDIT_RESOURCE_TYPES;

const Audit = mongoose.model('Audit', auditSchema);

module.exports = Audit;
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
module.exports.AUDIT_RESOURCE_TYPES = AUDIT_RESOURCE_TYPES;
