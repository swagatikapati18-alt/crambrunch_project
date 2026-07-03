const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const { Notification } = require('../models/Others');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// POST mark attendance (teacher)
router.post('/mark', protect, authorize('teacher', 'hod'), async (req, res) => {
  try {
    const { records, subject, date, slot } = req.body;
    // records: [{ studentId, status }]
    const results = [];
    for (const rec of records) {
      const att = await Attendance.findOneAndUpdate(
        { student: rec.studentId, subject, date: new Date(date) },
        { status: rec.status, teacher: req.user._id, slot },
        { upsert: true, new: true }
      );
      results.push(att);

      // Check if student attendance < 75% and notify parent
      const total = await Attendance.countDocuments({ student: rec.studentId, subject });
      const present = await Attendance.countDocuments({ student: rec.studentId, subject, status: 'present' });
      const pct = total > 0 ? (present / total) * 100 : 100;

      if (pct < 75) {
        const student = await User.findById(rec.studentId);
        if (student && student.parentEmail) {
          // Find parent user
          const parent = await User.findOne({ email: student.parentEmail });
          if (parent) {
            await Notification.create({
              recipient: parent._id,
              title: 'Attendance Warning',
              message: `${student.name}'s attendance in ${subject} has fallen to ${pct.toFixed(1)}% — below the 75% threshold.`,
              type: 'warning'
            });
          }
          // Notify student too
          await Notification.create({
            recipient: rec.studentId,
            title: 'Low Attendance Alert',
            message: `Your attendance in ${subject} is ${pct.toFixed(1)}%. You need to improve to stay eligible for exams.`,
            type: 'warning'
          });
        }
      }
    }
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET student attendance summary
router.get('/summary/:studentId', protect, async (req, res) => {
  try {
    const { studentId } = req.params;
    const records = await Attendance.find({ student: studentId });

    // Group by subject
    const subjectMap = {};
    for (const rec of records) {
      if (!subjectMap[rec.subject]) subjectMap[rec.subject] = { total: 0, present: 0 };
      subjectMap[rec.subject].total++;
      if (rec.status === 'present') subjectMap[rec.subject].present++;
    }

    const summary = Object.entries(subjectMap).map(([subject, data]) => {
      const percentage = data.total > 0 ? ((data.present / data.total) * 100).toFixed(1) : 0;
      return { subject, ...data, percentage: parseFloat(percentage) };
    });

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET attendance prediction for a student/subject
router.get('/predict/:studentId/:subject', protect, authorize('student', 'teacher', 'hod'), async (req, res) => {
  try {
    const { studentId, subject } = req.params;
    const semesterTotal = parseInt(req.query.totalClasses) || 60;

    // Fetch attendance data
    const conducted = await Attendance.countDocuments({ student: studentId, subject });
    const present = await Attendance.countDocuments({ student: studentId, subject, status: 'present' });
    const missedSoFar = conducted - present;

    // Calculate current percentage based on conducted classes
    const currentPercentage = conducted > 0 ? (present / conducted) * 100 : 100;

    // Logic:
    // Max misses allowed in total = 25% of semesterTotal
    // Must attend in total = 75% of semesterTotal
    const maxMissTotal = Math.floor(semesterTotal * 0.25);
    const mustAttendTotal = Math.ceil(semesterTotal * 0.75);

    const canMiss = Math.max(0, maxMissTotal - missedSoFar);
    const mustAttend = Math.max(0, mustAttendTotal - present);
    const remaining = semesterTotal - conducted;

    const isEligible = mustAttend <= remaining;

    res.json({
      success: true,
      data: {
        currentPercentage: parseFloat(currentPercentage.toFixed(1)),
        canMiss,
        mustAttend,
        remaining,
        isEligible,
        semesterTotal,
        message: isEligible
          ? (mustAttend > 0
              ? `You need to attend ${mustAttend} more classes out of ${remaining} remaining.`
              : `You are safe! You can still miss ${canMiss} classes.`)
          : `Warning: You cannot reach 75% even if you attend all ${remaining} remaining classes.`
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET attendance for a class (teacher view)
router.get('/class/:subject', protect, authorize('teacher', 'hod', 'super_admin'), async (req, res) => {
  try {
    const { date } = req.query;
    const filter = { subject: req.params.subject };
    if (date) filter.date = new Date(date);
    const records = await Attendance.find(filter).populate('student', 'name rollNumber');
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET chronological attendance records for a student (parent/student view)
router.get('/records/:studentId', protect, async (req, res) => {
  try {
    const { studentId } = req.params;
    const records = await Attendance.find({ student: studentId }).populate('teacher', 'name').sort({ date: -1, createdAt: -1 });
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
