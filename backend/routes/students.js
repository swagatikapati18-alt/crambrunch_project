const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// GET all students (teacher/hod/admin)
router.get('/', protect, authorize('super_admin', 'hod', 'teacher'), async (req, res) => {
  try {
    const { department, semester } = req.query;
    const filter = { role: 'student' };
    if (department) filter.department = { $regex: new RegExp(`^${department}$`, 'i') };
    if (semester) filter.semester = parseInt(semester);
    const students = await User.find(filter).select('-password');
    res.json({ success: true, data: students });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET student profile
router.get('/:id', protect, async (req, res) => {
  try {
    const student = await User.findById(req.params.id).select('-password');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, data: student });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update student
router.put('/:id', protect, async (req, res) => {
  try {
    const { name, phone, semester, department } = req.body;
    const student = await User.findByIdAndUpdate(req.params.id, { name, phone, semester, department }, { new: true }).select('-password');
    res.json({ success: true, data: student });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE student (admin only)
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Student deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST select a student as Class Representative (HOD / Super Admin)
router.post('/:id/select-cr', protect, authorize('hod', 'super_admin'), async (req, res) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    if (student.role !== 'student') return res.status(400).json({ success: false, message: 'User is not a student' });

    // Use provided department/semester or student's own
    const department = req.body.department || student.department;
    const semester = req.body.semester || student.semester;

    // HODs can only assign CRs within their department
    if (req.user.role === 'hod' && req.user.department && req.user.department.toLowerCase() !== (department || '').toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Cannot assign CR outside your department' });
    }

    // Unset previous CRs in the same dept+sem
    await User.updateMany({ department: { $regex: new RegExp(`^${department}$`, 'i') }, semester: semester, isCR: true }, { isCR: false, crAssignedAt: null, crAssignedBy: null });

    // Set selected student as CR
    student.isCR = true;
    student.crAssignedAt = new Date();
    student.crAssignedBy = req.user._id;
    await student.save();

    const out = await User.findById(student._id).select('-password');
    res.json({ success: true, data: out });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
