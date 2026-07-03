const express = require('express');
const router = express.Router();
const { ExtraClass, Timetable, Notification } = require('../models/Others');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const auditLogger = require('../utils/auditLogger');

async function isTeacherBusy(teacherId, { day, slot, department, excludeExtraClassId }) {
  const [timetableBusy, extraClassBusy] = await Promise.all([
    Timetable.exists({
      department,
      day,
      slot,
      $or: [
        { teacher: teacherId, substitutionStatus: { $ne: 'open' } },
        { substituteTeacher: teacherId }
      ]
    }),
    ExtraClass.exists({
      _id: { $ne: excludeExtraClassId },
      department,
      day,
      slot,
      status: { $in: ['approved', 'open_for_claim', 'claimed'] },
      $or: [
        { requestedBy: teacherId },
        { substituteTeacher: teacherId }
      ]
    })
  ]);

  return Boolean(timetableBusy || extraClassBusy);
}

async function notifyDepartmentTeachers(extraClass, excludedTeacherIds = []) {
  const teachers = await User.find({
    role: 'teacher',
    department: extraClass.department,
    isActive: true,
    _id: { $nin: excludedTeacherIds }
  }).select('_id');

  if (!teachers.length) return;

  await Notification.insertMany(
    teachers.map(teacher => ({
      recipient: teacher._id,
      title: 'Extra Class Slot Available',
      message: `${extraClass.subject} on ${extraClass.day} at ${extraClass.slot} is open for claiming.`,
      type: 'warning'
    }))
  );
}

router.post('/', protect, authorize('teacher', 'hod'), async (req, res) => {
  try {
    const requestedBy = req.user._id;
    const department = req.user.department || req.body.department;
    const payload = {
      department,
      semester: req.body.semester,
      day: req.body.day,
      slot: req.body.slot,
      subject: req.body.subject,
      room: req.body.room,
      reason: req.body.reason,
      requestedBy
    };

    const busy = await isTeacherBusy(requestedBy, {
      day: payload.day,
      slot: payload.slot,
      department: payload.department
    });
    if (busy) {
      return res.status(400).json({ success: false, message: 'You already have a class or extra class in this slot' });
    }

    const extraClass = await ExtraClass.create(payload);
    const hods = await User.find({ role: 'hod', department, isActive: true }).select('_id');
    if (hods.length) {
      await Notification.insertMany(
        hods.map(hod => ({
          recipient: hod._id,
          title: 'New Extra Class Request',
          message: `${req.user.name} requested an extra class for ${payload.subject} on ${payload.day} at ${payload.slot}.`,
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
      resourceId: extraClass._id,
      description: `${req.user.name} requested an extra class for ${payload.subject} on ${payload.day} ${payload.slot}`,
      newValues: { status: extraClass.status, subject: payload.subject, semester: payload.semester },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    const populated = await ExtraClass.findById(extraClass._id)
      .populate('requestedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('substituteTeacher', 'name');

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', protect, authorize('teacher', 'hod', 'super_admin'), async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'teacher') {
      filter.$or = [{ requestedBy: req.user._id }, { substituteTeacher: req.user._id }];
    } else {
      filter.department = req.user.role === 'hod' ? req.user.department : req.query.department;
    }
    if (req.query.status) filter.status = req.query.status;

    const extraClasses = await ExtraClass.find(filter)
      .populate('requestedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('substituteTeacher', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: extraClasses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/claimable', protect, authorize('teacher'), async (req, res) => {
  try {
    const openClasses = await ExtraClass.find({
      department: req.user.department,
      status: 'open_for_claim',
      requestedBy: { $ne: req.user._id }
    })
      .populate('requestedBy', 'name')
      .populate('substituteTeacher', 'name')
      .sort({ day: 1, slot: 1 });

    const availability = await Promise.all(openClasses.map(extraClass =>
      isTeacherBusy(req.user._id, {
        day: extraClass.day,
        slot: extraClass.slot,
        department: extraClass.department,
        excludeExtraClassId: extraClass._id
      })
    ));

    const data = openClasses.filter((_, index) => !availability[index]);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id/approve', protect, authorize('hod', 'super_admin'), async (req, res) => {
  try {
    const extraClass = await ExtraClass.findById(req.params.id);
    if (!extraClass) return res.status(404).json({ success: false, message: 'Extra class request not found' });
    if (req.user.role === 'hod' && extraClass.department !== req.user.department) {
      return res.status(403).json({ success: false, message: 'Can only manage requests from your department' });
    }
    if (extraClass.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending requests can be approved' });
    }

    extraClass.status = 'approved';
    extraClass.approvedBy = req.user._id;
    extraClass.approvedAt = new Date();
    await extraClass.save();

    await Notification.create({
      recipient: extraClass.requestedBy,
      title: 'Extra Class Approved',
      message: `${extraClass.subject} on ${extraClass.day} at ${extraClass.slot} has been approved.`,
      type: 'general'
    });

    const populated = await ExtraClass.findById(extraClass._id)
      .populate('requestedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('substituteTeacher', 'name');

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id/reject', protect, authorize('hod', 'super_admin'), async (req, res) => {
  try {
    const extraClass = await ExtraClass.findById(req.params.id);
    if (!extraClass) return res.status(404).json({ success: false, message: 'Extra class request not found' });
    if (req.user.role === 'hod' && extraClass.department !== req.user.department) {
      return res.status(403).json({ success: false, message: 'Can only manage requests from your department' });
    }
    if (extraClass.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending requests can be rejected' });
    }

    extraClass.status = 'rejected';
    extraClass.approvedBy = req.user._id;
    extraClass.approvedAt = new Date();
    extraClass.rejectionReason = req.body.reason || '';
    await extraClass.save();

    await Notification.create({
      recipient: extraClass.requestedBy,
      title: 'Extra Class Rejected',
      message: `${extraClass.subject} on ${extraClass.day} at ${extraClass.slot} was rejected.${extraClass.rejectionReason ? ` Reason: ${extraClass.rejectionReason}` : ''}`,
      type: 'warning'
    });

    res.json({ success: true, data: extraClass });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id/unavailable', protect, authorize('teacher'), async (req, res) => {
  try {
    const extraClass = await ExtraClass.findById(req.params.id);
    if (!extraClass) return res.status(404).json({ success: false, message: 'Extra class request not found' });
    if (extraClass.requestedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the requesting teacher can mark this unavailable' });
    }
    if (!['pending', 'approved'].includes(extraClass.status)) {
      return res.status(400).json({ success: false, message: 'Only pending or approved extra classes can be opened for claim' });
    }

    extraClass.status = 'open_for_claim';
    extraClass.originalTeacherUnavailableAt = new Date();
    await extraClass.save();

    await notifyDepartmentTeachers(extraClass, [req.user._id]);

    res.json({ success: true, data: extraClass });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id/claim', protect, authorize('teacher'), async (req, res) => {
  try {
    const extraClass = await ExtraClass.findById(req.params.id);
    if (!extraClass) return res.status(404).json({ success: false, message: 'Extra class request not found' });
    if (extraClass.department !== req.user.department) {
      return res.status(403).json({ success: false, message: 'Can only claim extra classes in your department' });
    }
    if (extraClass.requestedBy.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot claim your own extra class' });
    }
    if (extraClass.status !== 'open_for_claim') {
      return res.status(400).json({ success: false, message: 'This extra class is not open for claiming' });
    }

    const busy = await isTeacherBusy(req.user._id, {
      day: extraClass.day,
      slot: extraClass.slot,
      department: extraClass.department,
      excludeExtraClassId: extraClass._id
    });
    if (busy) {
      return res.status(400).json({ success: false, message: 'You are not free in this slot' });
    }

    const claimedAt = new Date();
    const claimedExtraClass = await ExtraClass.findOneAndUpdate(
      {
        _id: extraClass._id,
        status: 'open_for_claim',
        $or: [
          { substituteTeacher: { $exists: false } },
          { substituteTeacher: null }
        ]
      },
      {
        $set: {
          status: 'claimed',
          substituteTeacher: req.user._id,
          substituteClaimedAt: claimedAt
        }
      },
      { new: true }
    );

    if (!claimedExtraClass) {
      return res.status(409).json({ success: false, message: 'This extra class was already claimed by another teacher' });
    }

    const recipients = [claimedExtraClass.requestedBy];
    const hods = await User.find({ role: 'hod', department: claimedExtraClass.department, isActive: true }).select('_id');
    recipients.push(...hods.map(hod => hod._id));

    const uniqueRecipients = [...new Set(recipients.map(id => id.toString()))];
    await Notification.insertMany(
      uniqueRecipients.map(recipient => ({
        recipient,
        title: 'Extra Class Claimed',
        message: `${req.user.name} claimed ${claimedExtraClass.subject} on ${claimedExtraClass.day} at ${claimedExtraClass.slot}.`,
        type: 'general'
      }))
    );

    const populated = await ExtraClass.findById(claimedExtraClass._id)
      .populate('requestedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('substituteTeacher', 'name');

    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
