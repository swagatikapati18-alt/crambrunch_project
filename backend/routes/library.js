const express = require('express');
const router = express.Router();
const LibraryIssue = require('../models/Library');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// POST /library/issue (librarian issues a book)
router.post('/issue', protect, authorize('librarian', 'super_admin'), async (req, res) => {
  try {
    const { studentEmail, bookTitle, bookId, dueDate } = req.body;
    const student = await User.findOne({ email: studentEmail, role: 'student' });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    
    const issue = await LibraryIssue.create({
      bookTitle,
      bookId,
      student: student._id,
      dueDate: new Date(dueDate)
    });
    
    res.status(201).json({ success: true, data: issue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /library/issues (librarian views all issues)
router.get('/issues', protect, authorize('librarian', 'super_admin'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    
    const issues = await LibraryIssue.find(filter).populate('student', 'name email rollNumber').sort({ issuedAt: -1 });
    res.json({ success: true, data: issues });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /library/mine (student views their issues)
router.get('/mine', protect, async (req, res) => {
  try {
    const issues = await LibraryIssue.find({ student: req.user._id }).sort({ issuedAt: -1 });
    res.json({ success: true, data: issues });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /library/return/:id (librarian marks as returned)
router.put('/return/:id', protect, authorize('librarian', 'super_admin'), async (req, res) => {
  try {
    const { fine } = req.body;
    const issue = await LibraryIssue.findById(req.params.id);
    if (!issue) return res.status(404).json({ success: false, message: 'Record not found' });
    
    issue.status = 'returned';
    issue.returnedAt = new Date();
    if (fine !== undefined) issue.fine = fine;
    
    await issue.save();
    res.json({ success: true, data: issue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
