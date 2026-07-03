const express = require('express');
const router = express.Router();
const SystemConfig = require('../models/SystemConfig');
const { protect, authorize } = require('../middleware/auth');
const auditLogger = require('../utils/auditLogger');

// Get config
router.get('/', protect, async (req, res) => {
  try {
    let config = await SystemConfig.findOne();
    if (!config) {
      config = await SystemConfig.create({}); // default 7 days
    }
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update config
router.put('/', protect, authorize('super_admin', 'hod'), async (req, res) => {
  try {
    const { grievanceResolutionDays, holidays } = req.body;
    let config = await SystemConfig.findOne();
    
    if (!config) {
      config = new SystemConfig();
    }

    const oldValues = { 
      grievanceResolutionDays: config.grievanceResolutionDays,
      holidays: config.holidays
    };
    
    if (grievanceResolutionDays !== undefined) {
      config.grievanceResolutionDays = parseInt(grievanceResolutionDays);
    }
    if (holidays !== undefined) config.holidays = holidays;
    
    config.updatedBy = req.user._id;
    config.updatedAt = Date.now();
    await config.save();

    await auditLogger.log({
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'SYSTEM_CONFIG_CHANGE',
      resourceType: 'SYSTEM',
      resourceId: config._id,
      description: `${req.user.role === 'super_admin' ? 'Super Admin' : 'HOD'} updated System Configuration`,
      oldValues,
      newValues: { grievanceResolutionDays: config.grievanceResolutionDays }
    });

    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
