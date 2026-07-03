const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const auditLogger = require('../utils/auditLogger');
const {
  sendOTPEmail,
  sendPasswordResetEmail,
  sendParentNotification,
  sendParentCredentials,
  sendTeacherCredentials
} = require('../utils/email');

const Attendance = require('../models/Attendance');
const Marks = require('../models/Marks');
const Grievance = require('../models/Grievance');
const LibraryIssue = require('../models/Library');
const { Material, SkillTask, Notification, Timetable, Feedback } = require('../models/Others');
const { MicroInternship, InternshipApplication, DigitalBadge } = require('../models/MicroInternship');
const { SkillListing, TradeRequest } = require('../models/PeerExchange');

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
const generateOtpDetails = () => ({
  otp: crypto.randomInt(100000, 999999).toString(),
  otpExpires: new Date(Date.now() + 10 * 60 * 1000)
});
const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department,
  course: user.course,
  rollNumber: user.rollNumber,
  semester: user.semester,
  subjects: user.subjects,
  qualification: user.qualification,
  experience: user.experience,
  profilePhoto: user.profilePhoto,
  approvalStatus: user.approvalStatus
});

// GET /api/auth/setup-status
router.get('/setup-status', async (req, res) => {
  try {
    const superAdmin = await User.findOne({ role: 'super_admin' }).select('_id email');
    res.json({
      success: true,
      hasSuperAdmin: Boolean(superAdmin),
      superAdminEmail: superAdmin?.email || null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/initialize-super-admin
router.post('/initialize-super-admin', async (req, res) => {
  try {
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Super Admin already exists. Please sign in with that account.'
      });
    }

    const { name, email, password, department, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and password' });
    }

    const duplicateEmail = await User.findOne({ email });
    if (duplicateEmail) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'super_admin',
      department: department || 'Administration',
      phone,
      approvalStatus: 'approved',
      isEmailVerified: true,
      requires2FA: true
    });

    // Log super admin creation
    await auditLogger.log({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CREATE_USER',
      resourceType: 'USER',
      resourceId: user._id,
      description: `Super Admin account initialized: ${user.email}`,
      newValues: {
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      }
    });

    res.status(201).json({
      success: true,
      message: 'Super Admin account created successfully. Please sign in to continue.',
      user: serializeUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Please provide email and password' });

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Account deactivated' });
    if (!user.isEmailVerified) return res.status(403).json({ success: false, message: 'Please verify your email first' });

    // Check approval status for students
    if (user.role === 'student' && user.approvalStatus !== 'approved') {
      return res.status(403).json({ success: false, message: 'Your account is pending HOD approval' });
    }

    // 2FA for Super Admin
    if (user.role === 'super_admin' && user.requires2FA) {
      const { otp, otpExpires } = generateOtpDetails();
      user.twoFactorOtp = otp;
      user.twoFactorOtpExpires = otpExpires;
      user.twoFactorVerified = false;
      await user.save();

      const emailResult = await sendOTPEmail(email, otp);
      if (!emailResult.success) {
        return res.status(500).json({ success: false, message: 'Failed to send 2FA OTP' });
      }

      return res.json({
        success: true,
        requiresAdmin2FA: true,
        message: '2FA OTP sent to your email. Please verify to complete login.',
        userId: user._id
      });
    }

    // Log successful login
    await auditLogger.logLogin({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role
    }, req);

    res.json({
      success: true,
      token: generateToken(user._id),
      user: serializeUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/register-student - Student registration (pending approval)
router.post('/register-student', async (req, res) => {
  try {
    const {
      name, email, password, rollNumber, department, semester, phone,
      parentName, parentEmail, address, dateOfBirth
    } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'Email already registered' });

    const { otp, otpExpires } = generateOtpDetails();

    const user = await User.create({
      name, email, password, role: 'student',
      rollNumber, department, semester, phone,
      parentName, parentEmail, address, dateOfBirth,
      approvalStatus: 'pending',
      otp, otpExpires, isEmailVerified: false
    });

    const emailResult = await sendOTPEmail(email, otp);
    if (!emailResult.success) {
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({ success: false, message: 'Failed to send verification email' });
    }

    // Log student registration
    await auditLogger.log({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'CREATE_USER',
      resourceType: 'STUDENT',
      resourceId: user._id,
      description: `Student registered: ${user.name} (${user.rollNumber})`,
      newValues: {
        name: user.name,
        email: user.email,
        rollNumber: user.rollNumber,
        department: user.department,
        semester: user.semester
      },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Registration submitted! Please check your email for OTP verification. Your account will be activated after HOD approval.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/create-teacher - HOD creates teacher
router.post('/create-teacher', protect, async (req, res) => {
  try {
    if (!['hod', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only HOD and Super Admin can create teachers' });
    }

    const { name, email, department, course, semester, subjects, qualification, experience, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'Email already registered' });

    const teacherSemester = Number(semester);
    if (!Number.isInteger(teacherSemester) || teacherSemester < 1 || teacherSemester > 12) {
      return res.status(400).json({ success: false, message: 'Please select a valid semester for the teacher' });
    }

    // Generate random password
    const tempPassword = crypto.randomBytes(8).toString('hex');

    const user = await User.create({
      name, email, password: tempPassword, plainPassword: tempPassword, role: 'teacher',
      department, course, semester: teacherSemester, subjects, qualification, experience, phone,
      approvalStatus: 'approved',
      isEmailVerified: true
    });

    // Send credentials to teacher
    const emailResult = await sendTeacherCredentials(email, name, email, tempPassword);
    if (!emailResult.success) {
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({ success: false, message: 'Failed to send credentials email' });
    }

    // Log teacher creation
    await auditLogger.logUserCreation({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role
    }, user, req);

    res.status(201).json({
      success: true,
      message: 'Teacher account created and credentials sent via email',
      teacher: {
        id: user._id,
        name: user.name,
        email: user.email,
        department: user.department,
        semester: user.semester
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/create-hod - Super Admin creates HOD
router.post('/create-hod', protect, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can create HODs' });
    }

    const { name, email, department, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'Email already registered' });

    // Generate random password
    const tempPassword = crypto.randomBytes(8).toString('hex');

    const user = await User.create({
      name, email, password: tempPassword, role: 'hod',
      department, phone,
      approvalStatus: 'approved',
      isEmailVerified: true
    });

    // Send credentials to HOD
    const emailResult = await sendTeacherCredentials(email, name, email, tempPassword);
    if (!emailResult.success) {
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({ success: false, message: 'Failed to send credentials email' });
    }

    // Log HOD creation
    await auditLogger.logUserCreation({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role
    }, user, req);

    res.status(201).json({
      success: true,
      message: 'HOD account created and credentials sent via email',
      hod: {
        id: user._id,
        name: user.name,
        email: user.email,
        department: user.department
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/teachers - HOD or Super Admin gets teachers for a department
router.get('/teachers', protect, async (req, res) => {
  try {
    if (!['hod', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only HOD and Super Admin can view teachers' });
    }

    const department = req.user.role === 'hod' ? req.user.department : req.query.department;
    const teachers = await User.find({
      role: 'teacher',
      ...(department && { department })
    })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({ success: true, teachers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/users - Super Admin gets all users
router.get('/users', protect, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can view all users' });
    }

    const { role, department } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (department) filter.department = department;

    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/auth/users/:id - Super Admin updates a user
router.put('/users/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can update users' });
    }
    const { name, email, department, phone } = req.body;
    
    // Check if email is being changed and is already taken
    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: req.params.id } });
      if (existing) return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, department, phone },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    await auditLogger.logUserUpdate({
      userId: req.user._id, userEmail: req.user.email, userRole: req.user.role
    }, user._id, { name, email, department }, {}, req);

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/auth/users/:id/status - Super Admin toggles active state
router.patch('/users/:id/status', protect, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can manage user status' });
    }

    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Please provide isActive as true or false' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'super_admin' && user._id.toString() === req.user._id.toString() && !isActive) {
      return res.status(400).json({ success: false, message: 'Super Admin cannot deactivate their own account' });
    }

    user.isActive = isActive;
    await user.save();

    // Log user status change
    await auditLogger.logUserUpdate({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role
    }, user._id, { isActive: !isActive }, { isActive }, req);

    res.json({ success: true, message: `User ${isActive ? 'activated' : 'deactivated'} successfully` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/pending-students - HOD gets pending student approvals
router.get('/pending-students', protect, async (req, res) => {
  try {
    if (!['hod', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only HOD and Super Admin can view pending students' });
    }

    const department = req.user.role === 'hod' ? req.user.department : req.query.department;

    const query = {
      role: 'student',
      approvalStatus: 'pending'
    };
    
    if (department) {
      query.department = { $regex: new RegExp(`^${department}$`, 'i') };
    }

    const pendingStudents = await User.find(query).select('name email rollNumber department semester phone parentName parentEmail address dateOfBirth createdAt');

    res.json({ success: true, students: pendingStudents });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/approve-student - HOD approves student
router.post('/approve-student/:id', protect, async (req, res) => {
  try {
    if (!['hod', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only HOD and Super Admin can approve students' });
    }

    const student = await User.findById(req.params.id);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (req.user.role === 'hod' && student.department !== req.user.department) {
      return res.status(403).json({ success: false, message: 'Can only approve students from your department' });
    }

    student.approvalStatus = 'approved';
    student.approvedBy = req.user._id;
    student.approvedAt = new Date();
    await student.save();

    let parentAccountCreated = false;
    let parentPortalReady = false;

    // Create or link parent account so the parent dashboard is usable after approval.
    if (student.parentEmail) {
      const existingParent = await User.findOne({ email: student.parentEmail });

      if (!existingParent) {
        const tempPassword = crypto.randomBytes(8).toString('hex');
        const parentUser = await User.create({
          name: student.parentName || `Parent of ${student.name}`,
          email: student.parentEmail,
          password: tempPassword,
          role: 'parent',
          department: student.department,
          phone: student.phone,
          linkedStudent: student._id,
          approvalStatus: 'approved',
          isEmailVerified: true
        });

        parentAccountCreated = Boolean(parentUser);
        parentPortalReady = true;
        await sendParentCredentials(
          student.parentEmail,
          student.parentName,
          student.name,
          student.parentEmail,
          tempPassword
        );
      } else if (existingParent.role === 'parent') {
        if (!existingParent.linkedStudent) {
          existingParent.linkedStudent = student._id;
          await existingParent.save();
        }
        parentPortalReady = true;
      }

      await sendParentNotification(student.parentEmail, student.name, student.email);
    }

    // Log student approval
    await auditLogger.logStudentApproval({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role
    }, student, req);

    res.json({
      success: true,
      message: 'Student approved successfully',
      parentAccountCreated,
      parentPortalReady
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/reject-student - HOD rejects student
router.post('/reject-student/:id', protect, async (req, res) => {
  try {
    if (!['hod', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only HOD and Super Admin can reject students' });
    }

    const student = await User.findById(req.params.id);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (req.user.role === 'hod' && student.department !== req.user.department) {
      return res.status(403).json({ success: false, message: 'Can only reject students from your department' });
    }

    student.approvalStatus = 'rejected';
    student.approvedBy = req.user._id;
    student.approvedAt = new Date();
    await student.save();

    // Log student rejection
    await auditLogger.logStudentRejection({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role
    }, student, req);

    res.json({ success: true, message: 'Student rejected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// POST /api/auth/resend-verification-otp
router.post('/resend-verification-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Please provide email' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'This email is already verified' });
    }

    const { otp, otpExpires } = generateOtpDetails();
    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    const emailResult = await sendOTPEmail(email, otp);
    if (!emailResult.success) {
      return res.status(500).json({ success: false, message: 'Failed to send verification email' });
    }

    res.json({ success: true, message: 'Verification OTP sent to your email' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Please provide email and OTP' });

    const user = await User.findOne({ email, otp, otpExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

    user.isEmailVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Log email verification
    await auditLogger.logEmailVerification({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role
    }, req);

    if (user.role === 'student' && user.approvalStatus !== 'approved') {
      const hod = await User.findOne({
        role: 'hod',
        department: { $regex: new RegExp(`^${user.department}$`, 'i') }
      });
      if (hod) {
        await Notification.create({
          recipient: hod._id,
          title: 'Pending Student Approval',
          message: `${user.name} (${user.rollNumber}) has verified their email and is waiting for your approval.`,
          type: 'general'
        });
      }

      return res.json({
        success: true,
        message: 'Email verified successfully. Your account is now waiting for HOD approval.',
        requiresApproval: true,
        user: serializeUser(user)
      });
    }

    res.json({
      success: true,
      message: 'Email verified successfully',
      token: generateToken(user._id),
      requiresApproval: false,
      user: serializeUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/verify-2fa - Verify Super Admin 2FA OTP
router.post('/verify-2fa', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) return res.status(400).json({ success: false, message: 'Please provide user ID and OTP' });

    const user = await User.findById(userId);
    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Invalid user or not a Super Admin' });
    }

    if (user.twoFactorOtp !== otp || !user.twoFactorOtpExpires || user.twoFactorOtpExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired 2FA OTP' });
    }

    user.twoFactorOtp = undefined;
    user.twoFactorOtpExpires = undefined;
    user.twoFactorVerified = true;
    await user.save();

    // Log 2FA verification
    await auditLogger.log({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'LOGIN',
      resourceType: 'AUTH',
      description: `Super Admin 2FA verification successful`,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      metadata: { loginMethod: '2fa_verified' }
    });

    res.json({
      success: true,
      message: '2FA verified successfully. Welcome Super Admin!',
      token: generateToken(user._id),
      user: serializeUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Please provide email' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    const emailResult = await sendPasswordResetEmail(email, otp);
    if (!emailResult.success) return res.status(500).json({ success: false, message: 'Failed to send reset email' });

    // Log password reset request
    await auditLogger.logPasswordReset({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role
    }, req);

    res.json({ success: true, message: 'Password reset OTP sent to your email' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ success: false, message: 'Please provide email, OTP, and new password' });

    const user = await User.findOne({ email, otp, otpExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

    user.password = newPassword; // Will be hashed by pre-save hook
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Log password reset completion
    await auditLogger.log({
      userId: user._id,
      userEmail: user.email,
      userRole: user.role,
      action: 'PASSWORD_RESET',
      resourceType: 'AUTH',
      description: `${user.role} password reset completed`,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/seed - Re-enabled with comprehensive data
router.post('/seed', async (req, res) => {
  try {
    // Clear existing data (selective)
    await User.deleteMany({ email: { $in: [
      'superadmin@crambrunch.com', 'hod@crambrunch.com', 'teacher@crambrunch.com', 
      'student@crambrunch.com', 'parent@crambrunch.com', 'librarian@crambrunch.com'
    ] } });
    
    // 1. Create Users
    const superadmin = await User.create({
      name: 'Super Admin', email: 'superadmin@crambrunch.com', password: 'SuperAdmin@123',
      role: 'super_admin', department: 'Administration', approvalStatus: 'approved', isEmailVerified: true,
      requires2FA: true
    });

    const hod = await User.create({
      name: 'Dr. HOD', email: 'hod@crambrunch.com', password: 'Hod@123',
      role: 'hod', department: 'Computer Science', approvalStatus: 'approved', isEmailVerified: true
    });

    const teacher = await User.create({
      name: 'Prof. Teacher', email: 'teacher@crambrunch.com', password: 'Teacher@123',
      role: 'teacher', department: 'Computer Science', approvalStatus: 'approved', isEmailVerified: true,
      subjects: ['Data Structures', 'Web Development']
    });

    const student = await User.create({
      name: 'John Student', email: 'student@crambrunch.com', password: 'Student@123',
      role: 'student', department: 'Computer Science', semester: 4, rollNumber: 'CS2024001',
      parentEmail: 'parent@crambrunch.com', approvalStatus: 'approved', isEmailVerified: true
    });

    const parent = await User.create({
      name: 'Mr. Parent', email: 'parent@crambrunch.com', password: 'Parent@123',
      role: 'parent', linkedStudent: student._id, approvalStatus: 'approved', isEmailVerified: true
    });

    const librarian = await User.create({
      name: 'Ms. Librarian', email: 'librarian@crambrunch.com', password: 'Librarian@123',
      role: 'librarian', department: 'Library', approvalStatus: 'approved', isEmailVerified: true
    });

    // 2. Seed Academic Data
    const subjects = ['Data Structures', 'Web Development', 'Computer Networks', 'Mathematics IV'];
    
    // Attendance
    for (const sub of subjects) {
      for (let i = 1; i <= 20; i++) {
        await Attendance.create({
          student: student._id, subject: sub, teacher: teacher._id,
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
          status: Math.random() > 0.2 ? 'present' : 'absent'
        }).catch(()=>{}); // Ignore duplicates
      }
    }

    // Marks
    for (const sub of subjects) {
      await Marks.create({
        student: student._id, subject: sub, teacher: teacher._id, semester: 4,
        examType: 'internal', marksObtained: Math.floor(Math.random() * 20) + 10, totalMarks: 30
      });
      await Marks.create({
        student: student._id, subject: sub, teacher: teacher._id, semester: 4,
        examType: 'practical', marksObtained: Math.floor(Math.random() * 15) + 10, totalMarks: 25
      });
    }

    // 3. Seed Campus Data
    await Grievance.create({
      submittedBy: student._id, department: 'Computer Science', category: 'infrastructure',
      title: 'Lab AC not working', description: 'The AC in Lab 3 is not working for 2 days.',
      status: 'open', assignedTo: hod._id
    });

    await Material.create({
      title: 'DSA Notes Unit 1', subject: 'Data Structures', fileType: 'notes',
      uploadedBy: teacher._id, department: 'Computer Science', semester: 4,
      fileUrl: 'https://example.com/dsa-notes.pdf'
    });

    // 4. Seed SkillHub & Micro-Internships
    const internship = await MicroInternship.create({
      title: 'Department Portal Development', description: 'Help build the new CS department portal using React.',
      department: 'Computer Science', semester: 4, postedBy: teacher._id,
      badgeName: 'React Developer', badgeIcon: '🚀', badgeColor: '#0ea5e9',
      skills: ['React', 'CSS'], duration: '1 month', status: 'open'
    });

    // 5. Seed Library Data
    await LibraryIssue.create({
      bookTitle: 'Introduction to Algorithms',
      bookId: 'ISBN-9780262033848',
      student: student._id,
      issuedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });
    await LibraryIssue.create({
      bookTitle: 'Clean Code',
      bookId: 'ISBN-9780132350884',
      student: student._id,
      issuedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Overdue
      status: 'issued'
    });

    await SkillListing.create({
      postedBy: student._id, offerTitle: 'Python Basics', offerDescription: 'I can teach Python fundamentals.',
      offerCategory: 'programming', offerLevel: 'intermediate',
      wantTitle: 'UI Design', wantCategory: 'design', wantLevel: 'beginner'
    });

    res.json({
      success: true,
      message: 'Demo data seeded successfully!',
      credentials: {
        superadmin: 'superadmin@crambrunch.com / SuperAdmin@123',
        hod: 'hod@crambrunch.com / Hod@123',
        teacher: 'teacher@crambrunch.com / Teacher@123',
        student: 'student@crambrunch.com / Student@123',
        parent: 'parent@crambrunch.com / Parent@123'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== AUDIT LOG ENDPOINTS ====================

// GET /api/auth/audit-logs - Super Admin gets all audit logs
router.get('/audit-logs', protect, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can view audit logs' });
    }

    const { page = 1, limit = 50, action, userEmail, resourceType, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (action) filter.action = action;
    if (userEmail) filter.userEmail = new RegExp(userEmail, 'i');
    if (resourceType) filter.resourceType = resourceType;

    // Date range filter
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const Audit = require('../models/Audit');
    const total = await Audit.countDocuments(filter);
    const logs = await Audit.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name email role');

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/audit-logs/user/:userId - Get audit logs for specific user
router.get('/audit-logs/user/:userId', protect, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can view audit logs' });
    }

    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const Audit = require('../models/Audit');
    const total = await Audit.countDocuments({ userId: req.params.userId });
    const logs = await Audit.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/audit-logs/action/:action - Get audit logs for specific action
router.get('/audit-logs/action/:action', protect, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can view audit logs' });
    }

    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const Audit = require('../models/Audit');
    const total = await Audit.countDocuments({ action: req.params.action.toUpperCase() });
    const logs = await Audit.find({ action: req.params.action.toUpperCase() })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name email role');

    res.json({
      success: true,
      action: req.params.action.toUpperCase(),
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/audit-logs/stats - Get audit log statistics
router.get('/audit-logs/stats', protect, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can view audit logs' });
    }

    const Audit = require('../models/Audit');

    // Get logs from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stats = {
      totalLogs: await Audit.countDocuments(),
      logsLast7Days: await Audit.countDocuments({ timestamp: { $gte: sevenDaysAgo } }),
      actionBreakdown: await Audit.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      userBreakdown: await Audit.aggregate([
        { $group: { _id: '$userRole', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      resourceBreakdown: await Audit.aggregate([
        { $group: { _id: '$resourceType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      topUsers: await Audit.aggregate([
        { $group: { _id: '$userEmail', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      logsToday: await Audit.countDocuments({
        timestamp: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lte: new Date(new Date().setHours(23, 59, 59, 999))
        }
      })
    };

    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/audit-logs/export - Export audit logs (CSV format)
router.get('/audit-logs/export', protect, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can export audit logs' });
    }

    const { startDate, endDate } = req.query;
    const filter = {};

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const Audit = require('../models/Audit');
    const logs = await Audit.find(filter).sort({ timestamp: -1 }).populate('userId', 'name email role');

    // Convert to CSV
    const csv = convertLogsToCSV(logs);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Helper function to convert logs to CSV format
function convertLogsToCSV(logs) {
  const headers = ['Timestamp', 'User Email', 'User Role', 'Action', 'Resource Type', 'Resource ID', 'Description', 'IP Address', 'User Agent'];
  const rows = logs.map(log => [
    log.timestamp.toISOString(),
    log.userEmail,
    log.userRole,
    log.action,
    log.resourceType,
    log.resourceId || 'N/A',
    log.description || 'N/A',
    log.ipAddress || 'N/A',
    log.userAgent ? log.userAgent.substring(0, 100) : 'N/A'
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csv;
}

module.exports = router;
