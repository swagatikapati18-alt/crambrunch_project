const express = require('express');
const router = express.Router();
const { Feedback } = require('../models/Others');
const { protect, authorize } = require('../middleware/auth');

// Allow students and HODs (and super admin) to submit feedback
router.post('/', protect, authorize('student', 'hod', 'super_admin'), async (req, res) => {
  try {
    const existing = await Feedback.findOne({ student: req.user._id, teacher: req.body.teacher, subject: req.body.subject });
    if (existing) return res.status(400).json({ success: false, message: 'Already submitted feedback for this teacher/subject' });
    const fb = await Feedback.create({ ...req.body, student: req.user._id });
    res.status(201).json({ success: true, data: fb });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Make teacher feedback visible to students, the teacher, HODs and super admin
router.get('/teacher/:teacherId', protect, async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ teacher: req.params.teacherId })
      .populate('student', 'name');
    
    // Anonymize for everyone except HOD and Super Admin
    const safeFeedbacks = feedbacks.map(f => {
      const doc = f.toObject();
      if (req.user.role !== 'hod' && req.user.role !== 'super_admin') {
        doc.student = { name: 'Anonymous Student' };
      }
      return doc;
    });

    const avg = feedbacks.length > 0
      ? (feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length).toFixed(1)
      : 0;

    res.json({ success: true, data: safeFeedbacks, average: avg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Teachers can view their own feedback (strictly anonymized)
router.get('/my', protect, authorize('teacher'), async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ teacher: req.user._id });
    
    const avg = feedbacks.length > 0
      ? (feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length).toFixed(1)
      : 0;

    // Group by subject
    const subjectStats = {};
    feedbacks.forEach(f => {
      if (!subjectStats[f.subject]) subjectStats[f.subject] = { sum: 0, count: 0 };
      subjectStats[f.subject].sum += f.rating;
      subjectStats[f.subject].count++;
    });

    const subjects = Object.keys(subjectStats).map(s => ({
      subject: s,
      average: (subjectStats[s].sum / subjectStats[s].count).toFixed(1),
      count: subjectStats[s].count
    }));

    res.json({ success: true, data: feedbacks, average: avg, subjects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
