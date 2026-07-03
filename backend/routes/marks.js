// routes/marks.js
const express = require('express');
const router = express.Router();
const Marks = require('../models/Marks');
const { Notification } = require('../models/Others');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, authorize('teacher', 'hod'), async (req, res) => {
  try {
    const mark = await Marks.create({ ...req.body, teacher: req.user._id });
    // Notify student
    await Notification.create({
      recipient: req.body.student,
      title: 'Marks Updated',
      message: `Your ${req.body.examType} marks for ${req.body.subject} have been published: ${req.body.marksObtained}/${req.body.totalMarks}`,
      type: 'marks'
    });
    // Notify parent
    const student = await User.findById(req.body.student);
    if (student && student.parentEmail) {
      const parent = await User.findOne({ email: student.parentEmail });
      if (parent) {
        await Notification.create({
          recipient: parent._id,
          title: 'Result Declared',
          message: `${student.name}'s ${req.body.examType} marks for ${req.body.subject}: ${req.body.marksObtained}/${req.body.totalMarks}`,
          type: 'marks'
        });
      }
    }
    res.status(201).json({ success: true, data: mark });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/student/:studentId', protect, async (req, res) => {
  try {
    const marks = await Marks.find({ student: req.params.studentId });
    res.json({ success: true, data: marks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
