const mongoose = require('mongoose');

const electionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  department: { type: String, required: true },
  semester: { type: Number, required: true },
  
  status: { 
    type: String, 
    enum: ['scheduled', 'nomination', 'voting', 'completed', 'cancelled'], 
    default: 'nomination' 
  },
  
  startsAt: { type: Date },
  endsAt: { type: Date },

  candidates: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    manifesto: { type: String },
    votes: { type: Number, default: 0 }
  }],
  
  voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // list of students who have voted
  
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Election', electionSchema);
