const express = require('express');
const router = express.Router();
const Audit = require('../models/Audit');
const auditLogger = require('../utils/auditLogger');
const { protect } = require('../middleware/auth');

// All audit routes require authentication
router.use(protect);
router.use((req, res, next) => {
  if (!['super_admin', 'hod'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Only Super Admin and HOD can access audit logs'
    });
  }
  next();
});

function getPagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  return { page, limit, skip: (page - 1) * limit };
}

function buildAuditFilter(query) {
  const {
    userId,
    userEmail,
    action,
    resourceType,
    resourceId,
    startDate,
    endDate
  } = query;

  const filter = {};

  if (userId) filter.userId = userId;
  if (userEmail) filter.userEmail = new RegExp(userEmail, 'i');
  if (action) filter.action = action;
  if (resourceType) filter.resourceType = resourceType;
  if (resourceId) filter.resourceId = resourceId;

  if (startDate || endDate) {
    filter.timestamp = {};
    if (startDate) filter.timestamp.$gte = new Date(startDate);
    if (endDate) {
      const inclusiveEndDate = new Date(endDate);
      inclusiveEndDate.setHours(23, 59, 59, 999);
      filter.timestamp.$lte = inclusiveEndDate;
    }
  }

  return filter;
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

// GET /api/audit/logs - Get audit logs with filtering and pagination
router.get('/logs', async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = buildAuditFilter(req.query);
    const sortBy = req.query.sortBy || 'timestamp';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder;

    const [logs, total] = await Promise.all([
      Audit.find(filter)
      .populate('userId', 'name email')
      .populate('resourceId', 'name email rollNumber')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
      Audit.countDocuments(filter)
    ]);

    await auditLogger.logAuditView(auditLogger.getUserInfo(req), req, {
      endpoint: 'logs',
      page,
      limit,
      filters: Object.keys(filter)
    });

    res.json({
      success: true,
      data: logs,
      ledger: {
        immutable: true,
        appendOnly: true
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error('Audit logs fetch error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/audit/stats - Get audit statistics
router.get('/stats', async (req, res) => {
  try {
    const filter = buildAuditFilter(req.query);
    const matchFilter = { ...filter };

    const actionStats = await Audit.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          lastOccurred: { $max: '$timestamp' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const userStats = await Audit.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { userId: '$userId', userEmail: '$userEmail', userRole: '$userRole' },
          actions: { $sum: 1 },
          lastActivity: { $max: '$timestamp' }
        }
      },
      { $sort: { actions: -1 } },
      { $limit: 10 }
    ]);

    const resourceStats = await Audit.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$resourceType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dailyMatch = { ...matchFilter };
    dailyMatch.timestamp = {
      ...(dailyMatch.timestamp || {}),
      $gte: dailyMatch.timestamp?.$gte || thirtyDaysAgo
    };

    const dailyStats = await Audit.aggregate([
      { $match: dailyMatch },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    const [totalLogs, logsToday, latestEntry] = await Promise.all([
      Audit.countDocuments(matchFilter),
      Audit.countDocuments({
        ...matchFilter,
        timestamp: {
          ...(matchFilter.timestamp || {}),
          $gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }),
      Audit.findOne(matchFilter).sort({ timestamp: -1 }).select('timestamp action userEmail').lean()
    ]);

    await auditLogger.logAuditView(auditLogger.getUserInfo(req), req, {
      endpoint: 'stats'
    });

    res.json({
      success: true,
      stats: {
        totalLogs,
        logsToday,
        latestEntry,
        immutable: true,
        actionStats,
        userStats,
        resourceStats,
        dailyStats
      }
    });
  } catch (err) {
    console.error('Audit stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/audit/user-activity/:userId - Get activity for a specific user
router.get('/user-activity/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const logs = await Audit.find({ userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('resourceId', 'name email rollNumber')
      .lean();

    const total = await Audit.countDocuments({ userId });

    await auditLogger.logAuditView(auditLogger.getUserInfo(req), req, {
      endpoint: 'user-activity',
      targetUserId: userId
    });

    res.json({
      success: true,
      data: logs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalRecords: total
      }
    });
  } catch (err) {
    console.error('User activity fetch error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/audit/actions - Get available action types
router.get('/actions', (req, res) => {
  res.json({
    success: true,
    actions: Audit.ACTIONS
  });
});

// GET /api/audit/resource-types - Get available resource types
router.get('/resource-types', (req, res) => {
  res.json({
    success: true,
    resourceTypes: Audit.RESOURCE_TYPES
  });
});

// GET /api/audit/export - Export audit logs (CSV) — super_admin only
router.get('/export', async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can export audit logs' });
    }
    const filter = buildAuditFilter(req.query);
    const logs = await Audit.find(filter)
      .populate('userId', 'name email')
      .sort({ timestamp: -1 })
      .lean();

    await auditLogger.logAuditExport(auditLogger.getUserInfo(req), req, {
      exportedRecords: logs.length,
      filters: Object.keys(filter)
    });

    const headers = [
      'timestamp',
      'userEmail',
      'userRole',
      'action',
      'resourceType',
      'resourceId',
      'description',
      'ipAddress',
      'userAgent',
      'oldValues',
      'newValues',
      'metadata'
    ];

    const rows = logs.map(log => ([
      log.timestamp,
      log.userEmail,
      log.userRole,
      log.action,
      log.resourceType,
      log.resourceId || '',
      log.description,
      log.ipAddress || '',
      log.userAgent || '',
      log.oldValues,
      log.newValues,
      log.metadata
    ].map(escapeCsv).join(',')));

    const csv = [headers.join(','), ...rows].join('\n');
    const fileDate = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-ledger-${fileDate}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Audit export error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
