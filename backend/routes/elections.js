const express = require('express');
const router = express.Router();
const Election = require('../models/Election');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// POST start a new election (HOD only)
router.post('/', protect, authorize('hod'), async (req, res) => {
  try {
    const { title, description, semester, startsAt, endsAt } = req.body;
    const election = await Election.create({
      title,
      description,
      semester,
      startsAt,
      endsAt,
      department: req.user.department,
      createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: election });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET active elections for my dept/sem
router.get('/active', protect, async (req, res) => {
  try {
    const query = { 
      department: req.user.department, 
      status: { $in: ['nomination', 'voting'] } 
    };
    if (req.user.role === 'student') {
      query.semester = req.user.semester;
    }
    const elections = await Election.find(query)
      .populate('candidates.student', 'name rollNumber profilePhoto')
      .populate('winner', 'name');
    res.json({ success: true, data: elections });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST nominate self
router.post('/:id/nominate', protect, authorize('student'), async (req, res) => {
  try {
    const { manifesto } = req.body;
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    if (election.status !== 'nomination') return res.status(400).json({ success: false, message: 'Nominations are closed' });
    
    const alreadyCandidate = election.candidates.find(c => c.student.toString() === req.user._id.toString());
    if (alreadyCandidate) return res.status(400).json({ success: false, message: 'Already nominated' });

    election.candidates.push({ student: req.user._id, manifesto });
    await election.save();
    res.json({ success: true, data: election });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST vote for candidate
router.post('/:id/vote', protect, authorize('student'), async (req, res) => {
  try {
    const { candidateId } = req.body;
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    if (election.status !== 'voting') return res.status(400).json({ success: false, message: 'Voting is not open' });
    
    // Check time window
    const now = new Date();
    if (election.startsAt && now < new Date(election.startsAt)) {
      return res.status(400).json({ success: false, message: 'Voting has not started yet' });
    }
    if (election.endsAt && now > new Date(election.endsAt)) {
      return res.status(400).json({ success: false, message: 'Voting has ended' });
    }

    if (election.voters.includes(req.user._id)) return res.status(400).json({ success: false, message: 'Already voted' });

    const candidate = election.candidates.id(candidateId);
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found' });

    candidate.votes += 1;
    election.voters.push(req.user._id);
    await election.save();
    res.json({ success: true, data: election });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update status (HOD only)
router.put('/:id/status', protect, authorize('hod'), async (req, res) => {
  try {
    const { status } = req.body;
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: 'Election not found' });
    
    election.status = status;
    if (status === 'completed') {
      // Determine winner
      let maxVotes = -1;
      let winnerId = null;
      election.candidates.forEach(c => {
        if (c.votes > maxVotes) {
          maxVotes = c.votes;
          winnerId = c.student;
        }
      });
      election.winner = winnerId;
      // If we have a winner, assign as Class Representative (CR)
      if (winnerId) {
        // Unset previous CRs in same dept+sem
        await User.updateMany({ department: election.department, semester: election.semester, isCR: true }, { isCR: false, crAssignedAt: null, crAssignedBy: null });
        // Set winner as CR
        await User.findByIdAndUpdate(winnerId, { isCR: true, crAssignedAt: new Date(), crAssignedBy: req.user._id });
      }
    }
    await election.save();
    res.json({ success: true, data: election });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
