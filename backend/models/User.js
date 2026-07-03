const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  plainPassword: { type: String }, // Stored for admin visibility per user request
  role: { 
    type: String, 
    enum: ['super_admin', 'hod', 'teacher', 'student', 'parent', 'librarian'], 
    required: true 
  },
  // Approval workflow
  approvalStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'approved' // default approved for admin/hod/teacher, pending for students
  },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // HOD who approved
  approvedAt: { type: Date },
  
  // Student specific fields
  rollNumber: { type: String },
  department: { type: String },
  course: { type: String },
  semester: { type: Number },
  phone: { type: String },
  parentEmail: { type: String }, // student's parent email
  parentName: { type: String },
  address: { type: String },
  dateOfBirth: { type: Date },
  
  // Parent linking
  linkedStudent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // for parents
  
  // Teacher specific fields
  subjects: [{ type: String }], // for teachers
  qualification: { type: String },
  experience: { type: Number }, // years of experience
  
  profilePhoto: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpires: { type: Date },
  
  // 2FA for Super Admin
  requires2FA: { type: Boolean, default: false },
  twoFactorOtp: { type: String },
  twoFactorOtpExpires: { type: Date },
  twoFactorVerified: { type: Boolean, default: false },
  
  badges: [{ title: String, awardedAt: Date }],
  createdAt: { type: Date, default: Date.now }
  ,
  // Class Representative (CR) info
  isCR: { type: Boolean, default: false },
  crAssignedAt: { type: Date },
  crAssignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
