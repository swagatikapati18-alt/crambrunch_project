// routes/notifications.js
const express = require('express');
const router = express.Router();
const { Notification } = require('../models/Others');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const notes = await Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, data: notes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id/read', protect, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
