const mongoose = require('mongoose');

const libraryIssueSchema = new mongoose.Schema({
  bookTitle: { type: String, required: true },
  bookId: { type: String, required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  issuedAt: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['issued', 'returned'], default: 'issued' },
  returnedAt: { type: Date },
  fine: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('LibraryIssue', libraryIssueSchema);
