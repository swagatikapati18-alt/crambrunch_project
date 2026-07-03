const mongoose = require('mongoose');

// Skill Listing — what a student offers and wants in return
const skillListingSchema = new mongoose.Schema({
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // What I offer
  offerTitle: { type: String, required: true, trim: true },
  offerDescription: { type: String, required: true, trim: true },
  offerCategory: {
    type: String,
    enum: ['programming', 'design', 'mathematics', 'language', 'science', 'music', 'writing', 'data_science', 'hardware', 'other'],
    required: true
  },
  offerLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'intermediate' },

  // What I want in return
  wantTitle: { type: String, required: true, trim: true },
  wantCategory: {
    type: String,
    enum: ['programming', 'design', 'mathematics', 'language', 'science', 'music', 'writing', 'data_science', 'hardware', 'other'],
    required: true
  },
  wantLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },

  // Session details
  sessionFormat: { type: String, enum: ['online', 'offline', 'both'], default: 'both' },
  estimatedHours: { type: Number, default: 1, min: 0.5, max: 20 },
  tags: [{ type: String, trim: true }],

  // Status
  status: { type: String, enum: ['active', 'matched', 'completed', 'closed'], default: 'active' },
  views: { type: Number, default: 0 },

  // Stats
  averageRating: { type: Number, default: 0 },
  totalRatings: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Trade Request — a student expresses interest in a listing
const tradeRequestSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'SkillListing', required: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  listingOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // What the requester offers back
  counterOfferTitle: { type: String, required: true, trim: true },
  counterOfferDesc: { type: String, trim: true },
  proposedSchedule: { type: String, trim: true }, // free text e.g. "Weekends 10am-12pm"
  message: { type: String, trim: true }, // intro message

  status: { type: String, enum: ['pending', 'accepted', 'declined', 'cancelled', 'completed'], default: 'pending' },

  // Post-match
  agreedSchedule: { type: String },
  completedAt: { type: Date },

  createdAt: { type: Date, default: Date.now }
});

// Chat Message inside a trade
const tradeChatSchema = new mongoose.Schema({
  trade: { type: mongoose.Schema.Types.ObjectId, ref: 'TradeRequest', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, trim: true },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Rating — after trade completes, both sides rate each other
const tradeRatingSchema = new mongoose.Schema({
  trade: { type: mongoose.Schema.Types.ObjectId, ref: 'TradeRequest', required: true },
  rater: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ratee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  review: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = {
  SkillListing: mongoose.model('SkillListing', skillListingSchema),
  TradeRequest: mongoose.model('TradeRequest', tradeRequestSchema),
  TradeChat: mongoose.model('TradeChat', tradeChatSchema),
  TradeRating: mongoose.model('TradeRating', tradeRatingSchema)
};
