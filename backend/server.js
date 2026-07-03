const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static assets
app.use(express.static(path.join(__dirname, '../frontend/public')));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/students', require('./routes/students'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/marks', require('./routes/marks'));
app.use('/api/grievances', require('./routes/grievances'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/skillhub', require('./routes/skillhub'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/timetable', require('./routes/timetable'));
app.use('/api/extra-classes', require('./routes/extraClasses'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/peer-exchange', require('./routes/peerExchange'));
app.use('/api/micro-internship', require('./routes/microInternship'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/config', require('./routes/config'));
app.use('/api/library', require('./routes/library'));
app.use('/api/elections', require('./routes/elections'));

// Catch-all: serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 CRAMBRUNCH Server running on port ${PORT}`));
