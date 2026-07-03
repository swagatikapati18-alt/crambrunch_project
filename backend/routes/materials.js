// routes/materials.js
const express = require('express');
const router = express.Router();
const { Material } = require('../models/Others');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, authorize('teacher', 'hod', 'super_admin'), async (req, res) => {
  try {
    const mat = await Material.create({ ...req.body, uploadedBy: req.user._id });
    res.status(201).json({ success: true, data: mat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    const { subject, semester, department, fileType } = req.query;
    const filter = {};
    if (subject) filter.subject = subject;
    if (semester) filter.semester = parseInt(semester);
    if (department) filter.department = department;
    if (fileType) filter.fileType = fileType;
    const mats = await Material.find(filter).populate('uploadedBy', 'name').sort({ createdAt: -1 });
    res.json({ success: true, data: mats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, authorize('teacher', 'hod', 'super_admin'), async (req, res) => {
  try {
    await Material.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
