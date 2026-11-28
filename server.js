/**
 * EventPass - Main Node.js Backend Server
 * Tech Stack: HTML, CSS, JavaScript (Frontend) | Node.js, Express (Backend) | Supabase (Database)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./authRoutes');
const eventRoutes = require('./eventRoutes');
const { isSupabaseConfigured } = require('./supabaseClient');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable Cross-Origin Resource Sharing
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token']
}));

// Request body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets (HTML, CSS, JS)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', eventRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'EventPass',
    timestamp: new Date().toISOString(),
    supabaseConnected: isSupabaseConfigured(),
    storageMode: isSupabaseConfigured() ? 'Supabase Cloud Database' : 'Local Fallback Storage'
  });
});

// Single Page Application route: fallback to index.html for any unmatched non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start Express Server
const server = app.listen(PORT, () => {
  console.log('========================================================');
  console.log(`🚀 EventPass Server running at: http://localhost:${PORT}`);
  console.log(`📡 Database Mode: ${isSupabaseConfigured() ? 'Supabase Active' : 'Local Storage Fallback (Ready for Supabase)'}`);
  console.log('🔑 Complete Authentication Endpoints mounted at: /api/auth');
  console.log('========================================================');
});

module.exports = app;
