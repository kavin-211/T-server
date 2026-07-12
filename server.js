const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const mongoose = require('mongoose');

// Connect to MongoDB
const MONGODB_URI = 'mongodb+srv://kavinprasathvgp_db_user:<db_password>@cluster0.fhero8l.mongodb.net/abeneya';
mongoose.connect(MONGODB_URI).then(() => {
    console.log('✅ Connected to MongoDB');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});


// Routes
// Keep current /api/* mounts for backward compatibility
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Aliases for deployed frontend that calls /auth/* and /users/* (no /api prefix)
app.use('/auth', authRoutes);
app.use('/users', userRoutes);


// Serve static files (frontend) both in production and locally.
// Combined-repo structure: T-server/client/*
const clientDir = path.join(__dirname, 'client');
app.use(express.static(clientDir));
app.get('*', (req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
});


// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Data file: ${usersFile}`);
});