const express = require('express');
const router = express.Router();
const Grievance = require('../models/Grievance');
const User = require('../models/User');
const { Notification } = require('../models/Others');
const { protect, authorize } = require('../middleware/auth');
const auditLogger = require('../utils/auditLogger');

async function findDepartmentHod(department) {
  if (!department) return null;
  return User.findOne({ role: 'hod', department, isActive: true }).select('_id name email department');
}

async function findSuperAdmin() {
  return User.findOne({ role: 'super_admin', isActive: true }).select('_id name email role');
}

function canRevealAnonymousIdentity(grievance, user) {
  if (!grievance.isAnonymous) return true;
  if (!user) return false;
  if (user.role === 'super_admin') {
    return grievance.status === 'escalated' || Boolean(grievance.anonymousIdentityRevealedAt);
  }
  return false;
}

function formatGrievanceForResponse(grievanceDoc, user) {
  const grievance = grievanceDoc.toObject ? grievanceDoc.toObject() : grievanceDoc;
  const isOwner =
    user?.role === 'student' &&
    grievance.submittedBy &&
    grievance.submittedBy._id &&
    grievance.submittedBy._id.toString() === user._id.toString();
  const identityVisible = canRevealAnonymousIdentity(grievance, user) || isOwner;

  const studentLabel = grievance.isAnonymous
    ? identityVisible
      ? grievance.submittedBy?.name || 'Anonymous Student'
      : 'Anonymous'
    : grievance.submittedBy?.name || 'Unknown Student';

  if (grievance.isAnonymous && !identityVisible) {
    grievance.submittedBy = null;
  }

  grievance.studentLabel = studentLabel;
  grievance.identityProtected = grievance.isAnonymous && !identityVisible;
  grievance.identityRevealed = grievance.isAnonymous && identityVisible;
  return grievance;
}

async function notifyEscalation(grievance, targetUser) {
  if (!targetUser) return;

  await Notification.create({
    recipient: targetUser._id,
    title: 'Grievance Escalated',
    message: `Ticket ${grievance.ticketId} has been escalated for higher review.`,
    type: 'warning'
  });
}

// POST submit grievance
router.post('/', protect, async (req, res) => {
  try {
    const { category, title, description, isAnonymous } = req.body;
    const assignedHod = await findDepartmentHod(req.user.department);
    const grievance = await Grievance.create({
      category,
      title,
      description,
      isAnonymous,
      submittedBy: req.user._id,
      department: req.user.department,
      assignedTo: assignedHod?._id || null,
      lastActivityAt: new Date()
    });

    await auditLogger.log({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'GRIEVANCE_SUBMITTED',
      resourceType: 'GRIEVANCE',
      resourceId: grievance._id,
      description: `${req.user.role} submitted grievance ${grievance.ticketId}`,
      newValues: {
        category: grievance.category,
        department: grievance.department,
        isAnonymous: grievance.isAnonymous,
        assignedTo: grievance.assignedTo
      },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({ success: true, data: grievance });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET all grievances (hod/admin)
router.get('/', protect, authorize('super_admin', 'hod'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (req.user.role === 'hod') {
      filter.department = req.user.department;
    }

    const grievances = await Grievance.find(filter)
      .populate('submittedBy', 'name rollNumber')
      .populate('assignedTo', 'name')
      .populate('escalatedTo', 'name role')
      .sort({ createdAt: -1 });
    res.json({
      success: true,
      data: grievances.map(grievance => formatGrievanceForResponse(grievance, req.user))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET my grievances (student)
router.get('/mine', protect, async (req, res) => {
  try {
    const grievances = await Grievance.find({ submittedBy: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: grievances });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update status (hod/admin)
router.put('/:id/status', protect, authorize('super_admin', 'hod'), async (req, res) => {
  try {
    const { status, comment } = req.body;
    const grievance = await Grievance.findById(req.params.id).populate('submittedBy', 'name email');
    if (!grievance) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role === 'hod' && grievance.department !== req.user.department) {
      return res.status(403).json({ success: false, message: 'Can only manage grievances from your department' });
    }
    if (req.user.role === 'hod' && grievance.status === 'escalated') {
      return res.status(403).json({ success: false, message: 'Escalated grievances must be handled by higher authority' });
    }

    grievance.status = status;
    if (comment) grievance.comments.push({ by: req.user._id, text: comment });
    if (status === 'resolved') grievance.resolvedAt = new Date();
    if (status === 'escalated') {
      const superAdmin = await findSuperAdmin();
      if (!superAdmin) {
        return res.status(400).json({ success: false, message: 'No Super Admin available for escalation' });
      }
      grievance.escalatedTo = superAdmin._id;
      grievance.escalatedAt = new Date();
      if (grievance.isAnonymous && !grievance.anonymousIdentityRevealedAt) {
        grievance.anonymousIdentityRevealedAt = new Date();
      }
      await notifyEscalation(grievance, superAdmin);
    }
    if (status !== 'resolved' && status !== 'escalated') {
      grievance.resolvedAt = undefined;
    }
    grievance.lastActivityAt = new Date();
    await grievance.save();

    // Notify submitter even for anonymous tickets; the identity stays private to handlers.
    if (grievance.submittedBy) {
      let nTitle = 'Grievance Update';
      let nMessage = `Your grievance "${grievance.title}" status updated to: ${status.replace('_', ' ')}`;
      
      if (status === 'resolved') {
        nTitle = 'Grievance Resolved ✅';
        nMessage = `Good news! Your grievance "${grievance.title}" has been successfully resolved.`;
      } else if (status === 'escalated') {
        nTitle = 'Grievance Escalated 🚨';
        nMessage = `Your grievance "${grievance.title}" has been escalated to the Super Admin for further review.`;
      }

      await Notification.create({
        recipient: grievance.submittedBy._id,
        title: nTitle,
        message: nMessage,
        type: 'grievance'
      });
    }

    if (status === 'resolved') {
      await auditLogger.log({
        userId: req.user._id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'GRIEVANCE_RESOLVED',
        resourceType: 'GRIEVANCE',
        resourceId: grievance._id,
        description: `${req.user.role} marked grievance ${grievance.ticketId} as resolved`,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
      });
    }

    const refreshed = await Grievance.findById(grievance._id)
      .populate('submittedBy', 'name rollNumber')
      .populate('assignedTo', 'name')
      .populate('escalatedTo', 'name role');

    res.json({ success: true, data: formatGrievanceForResponse(refreshed, req.user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
