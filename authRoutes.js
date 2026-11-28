/**
 * EventPass - Simple Authentication Endpoints
 * Supports Email & Password Sign Up, Sign In, Session Check (/me), and Sign Out
 * Roles: 'attendee' and 'organizer'
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  findUserByEmail,
  findUserById,
  createUser,
  logAudit,
  isSupabaseConfigured
} = require('./supabaseClient');
const { authenticateToken, JWT_SECRET } = require('./authMiddleware');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// 1. REGISTER (Sign Up)
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, role } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        error: 'Please provide full name, email, and password.'
      });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address.'
      });
    }

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 60) {
      return res.status(400).json({
        success: false,
        error: 'Full name must be between 2 and 60 characters.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long.'
      });
    }

    const assignedRole = role === 'organizer' ? 'organizer' : 'attendee';

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists. Please sign in.'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await createUser({
      email,
      passwordHash,
      fullName: trimmedName,
      role: assignedRole
    });

    await logAudit({
      userId: newUser.id,
      email: newUser.email,
      action: 'REGISTER',
      role: newUser.role,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: `Welcome to EventPass, ${trimmedName}!`,
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.full_name,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error('[Auth Register Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred during registration.'
    });
  }
});

// 2. LOGIN (Sign In)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please enter both email and password.'
      });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      await logAudit({
        email,
        action: 'FAILED_LOGIN',
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logAudit({
        userId: user.id,
        email: user.email,
        action: 'FAILED_LOGIN',
        role: user.role,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    await logAudit({
      userId: user.id,
      email: user.email,
      action: 'LOGIN',
      role: user.role,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    const token = generateToken(user);

    return res.json({
      success: true,
      message: `Welcome back, ${user.full_name}!`,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('[Auth Login Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred during login.'
    });
  }
});

// 3. GET CURRENT USER PROFILE (/me)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.json({
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          fullName: req.user.fullName,
          role: req.user.role
        },
        supabaseConnected: isSupabaseConfigured()
      });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      },
      supabaseConnected: isSupabaseConfigured()
    });
  } catch (err) {
    console.error('[Auth /me Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch session profile.'
    });
  }
});

// 4. LOGOUT
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await logAudit({
      userId: req.user.id,
      email: req.user.email,
      action: 'LOGOUT',
      role: req.user.role,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    return res.json({ success: true, message: 'Signed out successfully.' });
  } catch (err) {
    return res.json({ success: true, message: 'Signed out.' });
  }
});

// 5. STATUS
router.get('/status', (req, res) => {
  res.json({
    success: true,
    supabaseConfigured: isSupabaseConfigured(),
    mode: isSupabaseConfigured() ? 'Supabase Database Active' : 'Local Fallback Active'
  });
});

module.exports = router;
