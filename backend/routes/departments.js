const express = require('express');
const router = express.Router();
const Department = require('../models/Department');
const { protect, authorize } = require('../middleware/auth');
const auditLogger = require('../utils/auditLogger');

const crypto = require('crypto');
const User = require('../models/User');
const { sendTeacherCredentials } = require('../utils/email');

// GET public departments (unprotected, for registration)
router.get('/public', async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true }).select('name code');
    res.json({ success: true, data: departments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET all departments
router.get('/', protect, async (req, res) => {
  try {
    const filter = req.user.role === 'super_admin' ? {} : { isActive: true };
    const departments = await Department.find(filter).populate('hod', 'name email phone plainPassword').sort({ name: 1 });
    res.json({ success: true, data: departments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create a department and HOD together
router.post('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    const { name, code, description, hodName, hodEmail, hodPhone, hodPassword } = req.body;
    
    if (!name || !code || !hodName || !hodEmail) {
      return res.status(400).json({ success: false, message: 'Department Name, Code, HOD Name and HOD Email are required' });
    }

    const existingDept = await Department.findOne({ $or: [{ name }, { code }] });
    if (existingDept) {
      return res.status(400).json({ success: false, message: 'Department with this name or code already exists' });
    }

    const existingUser = await User.findOne({ email: hodEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'HOD Email is already registered' });
    }

    const tempPassword = hodPassword || crypto.randomBytes(8).toString('hex');

    const hod = await User.create({
      name: hodName,
      email: hodEmail,
      password: tempPassword,
      plainPassword: tempPassword,
      role: 'hod',
      department: name,
      phone: hodPhone,
      approvalStatus: 'approved',
      isEmailVerified: true
    });

    const dept = await Department.create({
      name,
      code,
      description,
      hod: hod._id,
      createdBy: req.user._id
    });

    // Send credentials unconditionally (even if a custom password was provided)
    const emailResult = await sendTeacherCredentials(hodEmail, hodName, hodEmail, tempPassword);
    if (!emailResult.success) {
      console.log('Failed to send email during HOD creation for:', hodEmail);
    }

    await auditLogger.log({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'CREATE_DEPARTMENT',
      resourceType: 'DEPARTMENT',
      resourceId: dept._id,
      description: `Super Admin created department: ${dept.name} and assigned HOD: ${hod.name}`,
      newValues: { name: dept.name, code: dept.code, hodEmail: hod.email }
    });

    res.status(201).json({ success: true, data: dept });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update department (Super Admin only)
router.put('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const { name, code, description, hodName, hodEmail, hodPhone, hodPassword } = req.body;
    
    const dept = await Department.findById(req.params.id).populate('hod');
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });

    if (name) dept.name = name;
    if (code) dept.code = code;
    if (description !== undefined) dept.description = description;

    const existingDept = await Department.findOne({
      _id: { $ne: dept._id },
      $or: [{ name: dept.name }, { code: dept.code }]
    });
    if (existingDept) return res.status(400).json({ success: false, message: 'Another department with this name or code exists' });

    if (dept.hod) {
      const hod = await User.findById(dept.hod._id);
      if (hod) {
        if (hodEmail && hodEmail !== hod.email) {
          const existingUser = await User.findOne({ email: hodEmail });
          if (existingUser) return res.status(400).json({ success: false, message: 'HOD Email already in use' });
          hod.email = hodEmail;
        }
        if (hodName) hod.name = hodName;
        if (hodPhone !== undefined) hod.phone = hodPhone;
        if (name) hod.department = name;
        if (hodPassword) {
          hod.password = hodPassword;
          hod.plainPassword = hodPassword;
        }
        await hod.save();
      }
    } else if (hodName && hodEmail) {
      const existingUser = await User.findOne({ email: hodEmail });
      if (existingUser) return res.status(400).json({ success: false, message: 'HOD Email already registered' });
      const tempPassword = hodPassword || crypto.randomBytes(8).toString('hex');
      const hod = await User.create({
        name: hodName, email: hodEmail, password: tempPassword, plainPassword: tempPassword, role: 'hod',
        department: dept.name, phone: hodPhone, approvalStatus: 'approved', isEmailVerified: true
      });
      dept.hod = hod._id;
      if (!hodPassword) await sendTeacherCredentials(hodEmail, hodName, hodEmail, tempPassword);
    }
    
    await dept.save();

    res.json({ success: true, data: dept });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE department (soft delete)
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const dept = await Department.findById(req.params.id);
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });

    dept.isActive = !dept.isActive; // Toggle status
    await dept.save();

    res.json({ success: true, message: `Department ${dept.isActive ? 'activated' : 'deactivated'}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST resend HOD credentials
router.post('/:id/resend-credentials', protect, authorize('super_admin'), async (req, res) => {
  try {
    const dept = await Department.findById(req.params.id).populate('hod');
    if (!dept || !dept.hod) {
      return res.status(404).json({ success: false, message: 'Department or HOD not found' });
    }
    
    if (!dept.hod.plainPassword) {
      return res.status(400).json({ success: false, message: 'Plain text password not available. Please reset the password first.' });
    }

    await sendTeacherCredentials(dept.hod.email, dept.hod.name, dept.hod.email, dept.hod.plainPassword);

    await auditLogger.log({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'UPDATE_DEPARTMENT',
      resourceType: 'DEPARTMENT',
      resourceId: dept._id,
      description: `Super Admin resent credentials to HOD: ${dept.hod.name}`,
    });

    res.json({ success: true, message: 'Credentials sent to HOD successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET my department (HOD, teacher, student, super_admin)
router.get('/my-department', protect, authorize('hod','teacher','student','super_admin'), async (req, res) => {
  try {
    const dept = await Department.findOne({ name: req.user.department }).populate('hod', 'name email');
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
    res.json({ success: true, data: dept });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update my department courses (HOD only)
router.put('/my-department/courses', protect, authorize('hod'), async (req, res) => {
  try {
    const { courses } = req.body;
    if (!Array.isArray(courses)) return res.status(400).json({ success: false, message: 'Courses must be an array' });
    
    const dept = await Department.findOne({ name: req.user.department });
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });

    dept.courses = courses;
    await dept.save();

    await auditLogger.log({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'UPDATE_DEPARTMENT',
      resourceType: 'DEPARTMENT',
      resourceId: dept._id,
      description: `HOD updated courses for department: ${dept.name}`
    });

    res.json({ success: true, data: dept });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
