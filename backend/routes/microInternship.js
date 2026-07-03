const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { MicroInternship, InternshipApplication, DigitalBadge } = require('../models/MicroInternship');
const { Notification } = require('../models/Others') || {};
const User = require('../models/User');

const Notif = (() => {
  try { return require('../models/Others').Notification; } catch { return null; }
})();

async function notify(recipientId, title, message, type = 'skill') {
  if (!Notif) return;
  try { await Notif.create({ recipient: recipientId, title, message, type }); } catch {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isTeacherOrAbove(role) {
  return ['teacher', 'hod', 'super_admin'].includes(role);
}

// =============================================================================
// INTERNSHIP LISTINGS
// =============================================================================

// GET /api/micro-internship — list tasks (filtered)
router.get('/', protect, async (req, res) => {
  try {
    const { department, semester, status, category } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (semester)   filter.semester   = parseInt(semester);
    if (status)     filter.status     = status;
    if (category)   filter.badgeCategory = category;

    // Students only see open tasks from their dept
    if (req.user.role === 'student') {
      filter.department = req.user.department;
      filter.semester   = req.user.semester;
      if (!status) filter.status = 'open';
    }

    const tasks = await MicroInternship.find(filter)
      .populate('postedBy', 'name department')
      .sort({ createdAt: -1 });

    // Attach application counts + whether the student has applied
    const studentId = req.user.role === 'student' ? req.user._id : null;
    const enriched  = await Promise.all(tasks.map(async t => {
      const [appCount, myApp] = await Promise.all([
        InternshipApplication.countDocuments({ internship: t._id }),
        studentId ? InternshipApplication.findOne({ internship: t._id, student: studentId }).lean() : null
      ]);
      return { ...t.toObject(), appCount, myApp };
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/micro-internship — create task (teacher+)
router.post('/', protect, async (req, res) => {
  try {
    if (!isTeacherOrAbove(req.user.role))
      return res.status(403).json({ success: false, message: 'Only teachers can post micro-internships' });

    const {
      title, description, semester, badgeName, badgeIcon, badgeColor,
      badgeCategory, skills, duration, deadline, maxApplicants
    } = req.body;

    if (!title || !description || !badgeName || !semester)
      return res.status(400).json({ success: false, message: 'title, description, badgeName, semester required' });

    const task = await MicroInternship.create({
      title, description,
      department: req.user.department,
      semester:   parseInt(semester),
      badgeName, badgeIcon, badgeColor, badgeCategory,
      skills:    (typeof skills === 'string' ? skills.split(',').map(s => s.trim()) : skills) || [],
      duration, deadline, maxApplicants: parseInt(maxApplicants) || 10,
      postedBy: req.user._id
    });

    // Notify eligible students
    const students = await User.find({
      role: 'student', department: req.user.department,
      semester: parseInt(semester), approvalStatus: 'approved'
    }).select('_id');
    await Promise.all(students.map(s =>
      notify(s._id, '🎓 New Micro-Internship', `A new micro-internship "${title}" has been posted. Apply now to earn the "${badgeName}" badge!`, 'skill')
    ));

    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/micro-internship/my-posted — teacher's own tasks
router.get('/my-posted', protect, async (req, res) => {
  try {
    if (!isTeacherOrAbove(req.user.role))
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const tasks = await MicroInternship.find({ postedBy: req.user._id })
      .sort({ createdAt: -1 });

    const enriched = await Promise.all(tasks.map(async t => {
      const appCount = await InternshipApplication.countDocuments({ internship: t._id });
      return { ...t.toObject(), appCount };
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/micro-internship/:id — single task detail + applications (teacher)
router.get('/:id', protect, async (req, res) => {
  try {
    const task = await MicroInternship.findById(req.params.id)
      .populate('postedBy', 'name email department');
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });

    let applications = [];
    if (isTeacherOrAbove(req.user.role)) {
      applications = await InternshipApplication.find({ internship: task._id })
        .populate('student', 'name email rollNumber semester department');
    }

    res.json({ success: true, data: task, applications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/micro-internship/:id — update / cancel (owner only)
router.put('/:id', protect, async (req, res) => {
  try {
    if (!isTeacherOrAbove(req.user.role))
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const task = await MicroInternship.findOneAndUpdate(
      { _id: req.params.id, postedBy: req.user._id },
      req.body,
      { new: true }
    );
    if (!task) return res.status(404).json({ success: false, message: 'Not found or not authorized' });
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// APPLICATIONS
// =============================================================================

// POST /api/micro-internship/:id/apply — student applies
router.post('/:id/apply', protect, async (req, res) => {
  try {
    if (req.user.role !== 'student')
      return res.status(403).json({ success: false, message: 'Only students can apply' });

    const task = await MicroInternship.findById(req.params.id).populate('postedBy', 'name _id');
    if (!task) return res.status(404).json({ success: false, message: 'Internship not found' });
    if (task.status !== 'open') return res.status(400).json({ success: false, message: 'This internship is no longer accepting applications' });

    const existing = await InternshipApplication.findOne({ internship: task._id, student: req.user._id });
    if (existing) return res.status(400).json({ success: false, message: 'You have already applied' });

    const appCount = await InternshipApplication.countDocuments({ internship: task._id });
    if (appCount >= task.maxApplicants)
      return res.status(400).json({ success: false, message: 'Application limit reached' });

    const app = await InternshipApplication.create({
      internship: task._id,
      student:    req.user._id,
      statement:  req.body.statement || ''
    });

    // Notify teacher
    if (task.postedBy?._id) {
      await notify(task.postedBy._id, '📋 New Application', `${req.user.name} has applied for "${task.title}"`, 'skill');
    }

    if (appCount + 1 >= 1 && task.status === 'open') {
      await MicroInternship.findByIdAndUpdate(task._id, { status: 'in_progress' });
    }

    res.status(201).json({ success: true, data: app });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'You have already applied' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/micro-internship/:id/applications — teacher sees all applicants
router.get('/:id/applications', protect, async (req, res) => {
  try {
    if (!isTeacherOrAbove(req.user.role))
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const apps = await InternshipApplication.find({ internship: req.params.id })
      .populate('student', 'name email rollNumber semester department profilePhoto')
      .sort({ appliedAt: -1 });

    res.json({ success: true, data: apps });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/micro-internship/application/:appId/status — teacher accepts / rejects
router.put('/application/:appId/status', protect, async (req, res) => {
  try {
    if (!isTeacherOrAbove(req.user.role))
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const { status, feedback } = req.body;
    if (!['accepted', 'rejected'].includes(status))
      return res.status(400).json({ success: false, message: 'status must be accepted or rejected' });

    const app = await InternshipApplication.findByIdAndUpdate(
      req.params.appId,
      { status, teacherFeedback: feedback },
      { new: true }
    ).populate('student', 'name _id').populate('internship', 'title');

    if (!app) return res.status(404).json({ success: false, message: 'Application not found' });

    const msg = status === 'accepted'
      ? `🎉 Your application for "${app.internship?.title}" has been ACCEPTED! Get started!`
      : `Your application for "${app.internship?.title}" was not selected this time. Keep trying!`;
    await notify(app.student._id, status === 'accepted' ? '✅ Application Accepted' : '❌ Application Update', msg, 'skill');

    res.json({ success: true, data: app });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/micro-internship/application/:appId/complete — teacher marks done & awards badge
router.put('/application/:appId/complete', protect, async (req, res) => {
  try {
    if (!isTeacherOrAbove(req.user.role))
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const app = await InternshipApplication.findById(req.params.appId)
      .populate('student', 'name _id')
      .populate('internship');

    if (!app) return res.status(404).json({ success: false, message: 'Application not found' });
    if (app.badgeAwarded) return res.status(400).json({ success: false, message: 'Badge already awarded' });

    const task = app.internship;

    // Update application
    app.status       = 'completed';
    app.badgeAwarded = true;
    app.completedAt  = new Date();
    app.teacherFeedback = req.body.feedback || app.teacherFeedback;
    await app.save();

    // Create digital badge record
    const badge = await DigitalBadge.create({
      student:    app.student._id,
      awardedBy:  req.user._id,
      internship: task._id,
      application:app._id,
      name:       task.badgeName,
      icon:       task.badgeIcon,
      color:      task.badgeColor,
      category:   task.badgeCategory,
      description:`Awarded for completing the micro-internship: ${task.title}`
    });

    // Notify student
    await notify(
      app.student._id,
      `🏆 Badge Earned: ${task.badgeName}`,
      `Congratulations! You've completed "${task.title}" and earned the "${task.badgeName}" badge! 🎉`,
      'skill'
    );

    res.json({ success: true, data: { app, badge }, message: `Badge "${task.badgeName}" awarded to ${app.student.name}!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/micro-internship/application/:appId/submit — student submits work
router.put('/application/:appId/submit', protect, async (req, res) => {
  try {
    if (req.user.role !== 'student')
      return res.status(403).json({ success: false, message: 'Only students can submit' });

    const app = await InternshipApplication.findOneAndUpdate(
      { _id: req.params.appId, student: req.user._id },
      { submission: req.body.submission },
      { new: true }
    ).populate('internship', 'title postedBy');

    if (!app) return res.status(404).json({ success: false, message: 'Application not found' });

    // Notify teacher
    if (app.internship?.postedBy) {
      await notify(app.internship.postedBy, '📤 Work Submitted', `${req.user.name} submitted their work for "${app.internship?.title}"`, 'skill');
    }

    res.json({ success: true, data: app });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// STUDENT APPLICATIONS (my own)
// =============================================================================

// GET /api/micro-internship/my-applications — student sees their applications
router.get('/student/my-applications', protect, async (req, res) => {
  try {
    if (req.user.role !== 'student')
      return res.status(403).json({ success: false, message: 'Students only' });

    const apps = await InternshipApplication.find({ student: req.user._id })
      .populate('internship')
      .sort({ appliedAt: -1 });

    res.json({ success: true, data: apps });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// BADGES
// =============================================================================

// GET /api/micro-internship/badges/my — student's earned badges
router.get('/badges/my', protect, async (req, res) => {
  try {
    const studentId = req.user.role === 'student' ? req.user._id : req.query.studentId;
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId required' });

    const badges = await DigitalBadge.find({ student: studentId })
      .populate('awardedBy', 'name department')
      .populate('internship', 'title')
      .sort({ awardedAt: -1 });

    res.json({ success: true, data: badges });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/micro-internship/badges/leaderboard — top badge earners
router.get('/badges/leaderboard', protect, async (req, res) => {
  try {
    const board = await DigitalBadge.aggregate([
      { $group: { _id: '$student', count: { $sum: 1 }, latest: { $max: '$awardedAt' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'student' } },
      { $unwind: '$student' },
      { $project: { 'student.password': 0 } }
    ]);
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
