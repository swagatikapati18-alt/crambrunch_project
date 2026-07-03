const express = require('express');
const router = express.Router();
const { SkillTask } = require('../models/Others');
const User = require('../models/User');
const { Notification } = require('../models/Others');
const { protect, authorize } = require('../middleware/auth');

// POST create skill task / micro-internship
router.post('/', protect, async (req, res) => {
  try {
    const task = await SkillTask.create({ ...req.body, postedBy: req.user._id });
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET all tasks
router.get('/', protect, async (req, res) => {
  try {
    const { type, status } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    const tasks = await SkillTask.find(filter)
      .populate('postedBy', 'name role')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST apply for task
router.post('/:id/apply', protect, authorize('student'), async (req, res) => {
  try {
    const task = await SkillTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    if (task.applicants.includes(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Already applied' });
    }
    task.applicants.push(req.user._id);
    await task.save();
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT complete task and award badge
router.put('/:id/complete', protect, async (req, res) => {
  try {
    const task = await SkillTask.findById(req.params.id).populate('assignedTo');
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    task.status = 'completed';
    task.badgeAwarded = true;
    await task.save();

    // Award badge to student
    if (task.assignedTo) {
      await User.findByIdAndUpdate(task.assignedTo._id, {
        $push: { badges: { title: task.title, awardedAt: new Date() } }
      });
      await Notification.create({
        recipient: task.assignedTo._id,
        title: '🏅 Badge Earned!',
        message: `You've earned a badge for completing: "${task.title}"`,
        type: 'skill'
      });
    }
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT assign student to task
router.put('/:id/assign', protect, async (req, res) => {
  try {
    const task = await SkillTask.findByIdAndUpdate(
      req.params.id,
      { assignedTo: req.body.studentId, status: 'in_progress' },
      { new: true }
    );
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
