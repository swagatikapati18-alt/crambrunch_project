const express = require('express');
const router = express.Router();
const { SkillListing, TradeRequest, TradeChat, TradeRating } = require('../models/PeerExchange');
const { Notification } = require('../models/Others');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// ─── LISTINGS ──────────────────────────────────────────────────────────────

// GET all active listings (with filters)
router.get('/listings', protect, async (req, res) => {
  try {
    const { category, level, search, format, myListings } = req.query;
    const filter = {};

    if (myListings === 'true') {
      filter.postedBy = req.user._id;
    } else {
      filter.status = 'active';
      filter.postedBy = { $ne: req.user._id }; // don't show own listings in browse
    }

    if (category && category !== 'all') filter.offerCategory = category;
    if (level && level !== 'all') filter.offerLevel = level;
    if (format && format !== 'all') filter.sessionFormat = format;
    if (search) {
      filter.$or = [
        { offerTitle: { $regex: search, $options: 'i' } },
        { wantTitle: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    const listings = await SkillListing.find(filter)
      .populate('postedBy', 'name department semester profilePhoto badges')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: listings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single listing + increment views
router.get('/listings/:id', protect, async (req, res) => {
  try {
    const listing = await SkillListing.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    ).populate('postedBy', 'name department semester badges averageRating');
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    res.json({ success: true, data: listing });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create listing
router.post('/listings', protect, authorize('student'), async (req, res) => {
  try {
    const listing = await SkillListing.create({ ...req.body, postedBy: req.user._id });
    res.status(201).json({ success: true, data: listing });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update listing
router.put('/listings/:id', protect, async (req, res) => {
  try {
    const listing = await SkillListing.findOne({ _id: req.params.id, postedBy: req.user._id });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found or unauthorized' });
    Object.assign(listing, req.body, { updatedAt: new Date() });
    await listing.save();
    res.json({ success: true, data: listing });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE close listing
router.delete('/listings/:id', protect, async (req, res) => {
  try {
    const listing = await SkillListing.findOne({ _id: req.params.id, postedBy: req.user._id });
    if (!listing) return res.status(404).json({ success: false, message: 'Not found or unauthorized' });
    listing.status = 'closed';
    await listing.save();
    res.json({ success: true, message: 'Listing closed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── TRADE REQUESTS ─────────────────────────────────────────────────────────

// GET my trade requests (sent + received)
router.get('/trades', protect, async (req, res) => {
  try {
    const { role } = req.query; // 'sent' | 'received' | 'active'
    let filter = {};
    if (role === 'sent') filter.requester = req.user._id;
    else if (role === 'received') filter.listingOwner = req.user._id;
    else if (role === 'active') {
      filter.$or = [{ requester: req.user._id }, { listingOwner: req.user._id }];
      filter.status = 'accepted';
    } else {
      filter.$or = [{ requester: req.user._id }, { listingOwner: req.user._id }];
    }

    const trades = await TradeRequest.find(filter)
      .populate('listing', 'offerTitle wantTitle offerCategory')
      .populate('requester', 'name department semester')
      .populate('listingOwner', 'name department semester')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: trades });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST send trade request
router.post('/trades', protect, authorize('student'), async (req, res) => {
  try {
    const listing = await SkillListing.findById(req.body.listing).populate('postedBy');
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (listing.postedBy._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot request your own listing' });
    }
    // Check for existing pending request
    const existing = await TradeRequest.findOne({
      listing: req.body.listing,
      requester: req.user._id,
      status: { $in: ['pending', 'accepted'] }
    });
    if (existing) return res.status(400).json({ success: false, message: 'You already sent a request for this listing' });

    const trade = await TradeRequest.create({
      ...req.body,
      requester: req.user._id,
      listingOwner: listing.postedBy._id
    });

    // Notify listing owner
    await Notification.create({
      recipient: listing.postedBy._id,
      title: '🔄 New Trade Request!',
      message: `${req.user.name} wants to trade with you: "${listing.offerTitle}"`,
      type: 'skill'
    });

    res.status(201).json({ success: true, data: trade });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT accept/decline/cancel/complete trade
router.put('/trades/:id/status', protect, async (req, res) => {
  try {
    const { status, agreedSchedule } = req.body;
    const trade = await TradeRequest.findById(req.params.id)
      .populate('requester', 'name')
      .populate('listingOwner', 'name')
      .populate('listing', 'offerTitle status');

    if (!trade) return res.status(404).json({ success: false, message: 'Trade not found' });

    // Authorization checks
    const isOwner = trade.listingOwner._id.toString() === req.user._id.toString();
    const isRequester = trade.requester._id.toString() === req.user._id.toString();

    if (['accepted', 'declined'].includes(status) && !isOwner) {
      return res.status(403).json({ success: false, message: 'Only listing owner can accept/decline' });
    }
    if (status === 'cancelled' && !isRequester) {
      return res.status(403).json({ success: false, message: 'Only requester can cancel' });
    }
    if (status === 'completed' && !(isOwner || isRequester)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    trade.status = status;
    if (agreedSchedule) trade.agreedSchedule = agreedSchedule;
    if (status === 'completed') trade.completedAt = new Date();
    await trade.save();

    // Update listing status
    if (status === 'accepted') {
      await SkillListing.findByIdAndUpdate(trade.listing._id, { status: 'matched' });
    }
    if (status === 'completed') {
      await SkillListing.findByIdAndUpdate(trade.listing._id, { status: 'completed' });
    }

    // Notify the other party
    const notifRecipient = isOwner ? trade.requester._id : trade.listingOwner._id;
    const msgs = {
      accepted: `🎉 Your trade request was accepted! Connect and schedule your sessions.`,
      declined: `Your trade request was declined. Keep exploring!`,
      completed: `✅ Trade marked as completed. Don't forget to rate your partner!`,
      cancelled: `ℹ️ A trade request was cancelled.`
    };
    await Notification.create({
      recipient: notifRecipient,
      title: `Trade ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: msgs[status] || `Trade status updated to ${status}`,
      type: 'skill'
    });

    res.json({ success: true, data: trade });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── TRADE CHAT ─────────────────────────────────────────────────────────────

// GET messages for a trade
router.get('/trades/:id/chat', protect, async (req, res) => {
  try {
    const trade = await TradeRequest.findById(req.params.id);
    if (!trade) return res.status(404).json({ success: false, message: 'Trade not found' });
    const isParticipant =
      trade.requester.toString() === req.user._id.toString() ||
      trade.listingOwner.toString() === req.user._id.toString();
    if (!isParticipant) return res.status(403).json({ success: false, message: 'Access denied' });

    // Mark messages as read
    await TradeChat.updateMany({ trade: req.params.id, sender: { $ne: req.user._id }, isRead: false }, { isRead: true });

    const messages = await TradeChat.find({ trade: req.params.id })
      .populate('sender', 'name')
      .sort({ createdAt: 1 });

    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST send chat message
router.post('/trades/:id/chat', protect, async (req, res) => {
  try {
    const trade = await TradeRequest.findById(req.params.id);
    if (!trade) return res.status(404).json({ success: false, message: 'Trade not found' });
    if (!['accepted', 'completed'].includes(trade.status)) {
      return res.status(400).json({ success: false, message: 'Chat is only available for accepted trades' });
    }
    const isParticipant =
      trade.requester.toString() === req.user._id.toString() ||
      trade.listingOwner.toString() === req.user._id.toString();
    if (!isParticipant) return res.status(403).json({ success: false, message: 'Access denied' });

    const msg = await TradeChat.create({
      trade: req.params.id,
      sender: req.user._id,
      message: req.body.message
    });
    const populated = await msg.populate('sender', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── RATINGS ──────────────────────────────────────────────────────────────

// POST rate after completion
router.post('/trades/:id/rate', protect, async (req, res) => {
  try {
    const trade = await TradeRequest.findById(req.params.id)
      .populate('requester listingOwner');
    if (!trade) return res.status(404).json({ success: false, message: 'Trade not found' });
    if (trade.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Can only rate completed trades' });
    }

    const isParticipant =
      trade.requester._id.toString() === req.user._id.toString() ||
      trade.listingOwner._id.toString() === req.user._id.toString();
    if (!isParticipant) return res.status(403).json({ success: false, message: 'Access denied' });

    // Check already rated
    const already = await TradeRating.findOne({ trade: req.params.id, rater: req.user._id });
    if (already) return res.status(400).json({ success: false, message: 'You already rated this trade' });

    const ratee = trade.requester._id.toString() === req.user._id.toString()
      ? trade.listingOwner._id
      : trade.requester._id;

    const rating = await TradeRating.create({
      trade: req.params.id,
      rater: req.user._id,
      ratee,
      rating: req.body.rating,
      review: req.body.review
    });

    // Update listing average
    const listingRatings = await TradeRating.find({ trade: req.params.id });
    const avg = listingRatings.reduce((s, r) => s + r.rating, 0) / listingRatings.length;
    await SkillListing.findByIdAndUpdate(trade.listing, {
      averageRating: avg.toFixed(1),
      totalRatings: listingRatings.length
    });

    res.status(201).json({ success: true, data: rating });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── STATS ───────────────────────────────────────────────────────────────

// GET peer exchange stats for current user
router.get('/stats', protect, async (req, res) => {
  try {
    const uid = req.user._id;
    const [myListings, sentTrades, receivedTrades, completedTrades] = await Promise.all([
      SkillListing.countDocuments({ postedBy: uid }),
      TradeRequest.countDocuments({ requester: uid }),
      TradeRequest.countDocuments({ listingOwner: uid, status: 'pending' }),
      TradeRequest.countDocuments({
        $or: [{ requester: uid }, { listingOwner: uid }],
        status: 'completed'
      })
    ]);
    res.json({ success: true, data: { myListings, sentTrades, receivedTrades, completedTrades } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET leaderboard (top traders)
router.get('/leaderboard', protect, async (req, res) => {
  try {
    const results = await TradeRequest.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$requester',
          completed: { $sum: 1 }
        }
      },
      { $sort: { completed: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $project: { 'user.name': 1, 'user.department': 1, 'user.semester': 1, completed: 1 } }
    ]);
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
