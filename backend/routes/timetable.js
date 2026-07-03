const express = require('express');
const router = express.Router();
const { Timetable, Notification } = require('../models/Others');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const auditLogger = require('../utils/auditLogger');

const CLAIMABLE_SUBSTITUTION_STATUSES = ['open'];

async function isTeacherBusy(teacherId, { day, slot, excludeId }) {
  return Timetable.exists({
    _id: { $ne: excludeId },
    day,
    slot,
    $or: [
      { teacher: teacherId, substitutionStatus: { $ne: 'open' } },
      { substituteTeacher: teacherId }
    ]
  });
}

async function notifyDepartmentTeachers(entry, excludedTeacherIds = []) {
  const teachers = await User.find({
    role: 'teacher',
    department: entry.department,
    isActive: true,
    _id: { $nin: excludedTeacherIds }
  }).select('_id');

  if (!teachers.length) return;

  await Notification.insertMany(
    teachers.map(teacher => ({
      recipient: teacher._id,
      title: 'Substitution Period Available',
      message: `${entry.subject} on ${entry.day} at ${entry.slot} is open for claiming.`,
      type: 'warning'
    }))
  );
}

router.post('/', protect, authorize('super_admin', 'hod'), async (req, res) => {
  try {
    const body = { ...req.body };
    if (req.user.role === 'hod') {
      body.department = req.user.department;
    }

    const entry = await Timetable.create(body);
    const populated = await Timetable.findById(entry._id)
      .populate('teacher', 'name')
      .populate('substituteTeacher', 'name');

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/substitutions/open', protect, authorize('teacher', 'hod', 'super_admin'), async (req, res) => {
  try {
    const filter = {
      substitutionStatus: { $in: CLAIMABLE_SUBSTITUTION_STATUSES }
    };

    if (req.user.role === 'teacher') {
      filter.department = req.user.department;
      filter.teacher = { $ne: req.user._id };
    } else if (req.query.department) {
      filter.department = req.query.department;
    }

    const entries = await Timetable.find(filter)
      .populate('teacher', 'name')
      .populate('substituteTeacher', 'name')
      .sort({ day: 1, slot: 1 });

    let data = entries;
    if (req.user.role === 'teacher') {
      const availability = await Promise.all(entries.map(entry =>
        isTeacherBusy(req.user._id, { day: entry.day, slot: entry.slot, excludeId: entry._id })
      ));

      data = entries
        .map((entry, index) => ({ entry, teacherBusy: Boolean(availability[index]) }))
        .filter(item => !item.teacherBusy)
        .map(item => item.entry);
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/open-substitution', protect, authorize('super_admin', 'hod'), async (req, res) => {
  try {
    const { reason } = req.body;
    const entry = await Timetable.findById(req.params.id).populate('teacher', 'name');
    if (!entry) return res.status(404).json({ success: false, message: 'Timetable entry not found' });
    if (req.user.role === 'hod' && entry.department !== req.user.department) {
      return res.status(403).json({ success: false, message: 'Can only manage timetable for your department' });
    }
    if (!entry.teacher) {
      return res.status(400).json({ success: false, message: 'Assign a teacher before opening substitution' });
    }
    if (entry.substitutionStatus === 'claimed') {
      return res.status(400).json({ success: false, message: 'This period is already claimed by another teacher' });
    }

    entry.substitutionStatus = 'open';
    entry.substitutionRequestedBy = req.user._id;
    entry.substitutionOpenedAt = new Date();
    entry.substitutionReason = reason || '';
    entry.substituteTeacher = undefined;
    entry.substitutionClaimedAt = undefined;
    await entry.save();

    await notifyDepartmentTeachers(entry, [entry.teacher._id]);

    await auditLogger.log({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'TIMETABLE_UPDATED',
      resourceType: 'TIMETABLE',
      resourceId: entry._id,
      description: `${req.user.role} opened substitution for ${entry.subject} on ${entry.day} ${entry.slot}`,
      newValues: {
        substitutionStatus: entry.substitutionStatus,
        substitutionReason: entry.substitutionReason
      },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    const populated = await Timetable.findById(entry._id)
      .populate('teacher', 'name')
      .populate('substituteTeacher', 'name');

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/claim', protect, authorize('teacher'), async (req, res) => {
  try {
    const entry = await Timetable.findById(req.params.id)
      .populate('teacher', 'name')
      .populate('substituteTeacher', 'name');

    if (!entry) return res.status(404).json({ success: false, message: 'Timetable entry not found' });
    if (entry.department !== req.user.department) {
      return res.status(403).json({ success: false, message: 'Can only claim substitutions from your department' });
    }
    if (!CLAIMABLE_SUBSTITUTION_STATUSES.includes(entry.substitutionStatus)) {
      return res.status(400).json({ success: false, message: 'This period is not open for substitution' });
    }
    if (entry.teacher && entry.teacher._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot claim your own scheduled period' });
    }

    const busy = await isTeacherBusy(req.user._id, {
      day: entry.day,
      slot: entry.slot,
      excludeId: entry._id
    });
    if (busy) {
      return res.status(400).json({ success: false, message: 'You already have a class or claimed substitution in this slot' });
    }

    entry.substituteTeacher = req.user._id;
    entry.substitutionStatus = 'claimed';
    entry.substitutionClaimedAt = new Date();
    await entry.save();

    const recipients = [];
    if (entry.teacher?._id) recipients.push(entry.teacher._id);
    const hods = await User.find({ role: 'hod', department: entry.department, isActive: true }).select('_id');
    recipients.push(...hods.map(hod => hod._id));

    if (recipients.length) {
      const uniqueRecipients = [...new Set(recipients.map(id => id.toString()))];
      await Notification.insertMany(
        uniqueRecipients.map(recipient => ({
          recipient,
          title: 'Substitution Claimed',
          message: `${req.user.name} claimed ${entry.subject} on ${entry.day} at ${entry.slot}.`,
          type: 'general'
        }))
      );
    }

    await auditLogger.log({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'TIMETABLE_UPDATED',
      resourceType: 'TIMETABLE',
      resourceId: entry._id,
      description: `${req.user.name} claimed substitution for ${entry.subject} on ${entry.day} ${entry.slot}`,
      newValues: {
        substitutionStatus: entry.substitutionStatus,
        substituteTeacher: req.user._id
      },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    const populated = await Timetable.findById(entry._id)
      .populate('teacher', 'name')
      .populate('substituteTeacher', 'name');

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    const { department, semester } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (semester) filter.semester = parseInt(semester, 10);

    const entries = await Timetable.find(filter)
      .populate('teacher', 'name')
      .populate('substituteTeacher', 'name')
      .sort({ day: 1, slot: 1 });

    res.json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, authorize('super_admin', 'hod'), async (req, res) => {
  try {
    const entry = await Timetable.findById(req.params.id);
    if (!entry) return res.status(404).json({ success: false, message: 'Timetable entry not found' });
    if (req.user.role === 'hod' && entry.department !== req.user.department) {
      return res.status(403).json({ success: false, message: 'Can only delete timetable for your department' });
    }

    await Timetable.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
