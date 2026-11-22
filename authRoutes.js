/**
 * EventPass - Authentication Endpoints
 * Supports:
 * - Email & Password Sign Up & Sign In
 * - Role-Based Access (Organizer, Volunteer, Attendee)
 * - Quick PIN Login for Entrance Check-in Desks
 * - Session Validation & Token Refresh (/me)
 * - Audit Logging for Security
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
  isSupabaseConfigured,
  getLocalUsers 
} = require('./supabaseClient');
const { authenticateToken, JWT_SECRET } = require('./authMiddleware');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Helper: Generate JWT Token
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

// ----------------------------------------------------
// 1. REGISTER (Sign Up)
// ----------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, role, pinCode } = req.body;

    // Field validation
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

    const allowedRoles = ['organizer', 'volunteer', 'attendee'];
    const assignedRole = allowedRoles.includes(role) ? role : 'volunteer';

    // Check if email already registered
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists. Please sign in.'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user in Supabase or Local Store
    const newUser = await createUser({
      email,
      passwordHash,
      fullName: trimmedName,
      role: assignedRole,
      pinCode: pinCode || (assignedRole === 'organizer' ? '9999' : '1234')
    });

    // Audit log
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
      message: `Welcome to EventPass, ${trimmedName}! Your account has been created.`,
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.full_name,
        role: newUser.role,
        pinCode: newUser.pin_code
      }
    });
  } catch (err) {
    console.error('[Auth Register Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred during registration. Please try again.'
    });
  }
});

// ----------------------------------------------------
// 2. LOGIN (Sign In)
// ----------------------------------------------------
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

    // Compare password
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

    // Success audit log
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
        role: user.role,
        pinCode: user.pin_code
      }
    });
  } catch (err) {
    console.error('[Auth Login Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred during login. Please try again.'
    });
  }
});

// ----------------------------------------------------
// 3. QUICK PIN LOGIN (Desk Mode)
// ----------------------------------------------------
router.post('/pin-login', async (req, res) => {
  try {
    const { role, pin } = req.body;

    if (!role || !pin) {
      return res.status(400).json({
        success: false,
        error: 'Please provide both role and 4-digit PIN.'
      });
    }

    const cleanPin = pin.toString().trim();
    const targetRole = role.toLowerCase();

    // Check system default PINs
    const defaultOrganizerPin = process.env.DESK_ORGANIZER_PIN || '9999';
    const defaultVolunteerPin = process.env.DESK_VOLUNTEER_PIN || '1234';

    let matchedUser = null;

    if (targetRole === 'organizer' && cleanPin === defaultOrganizerPin) {
      matchedUser = {
        id: 'desk-organizer',
        email: 'organizer-desk@eventpass.internal',
        full_name: 'Lead Organizer (Desk)',
        role: 'organizer',
        pin_code: cleanPin
      };
    } else if (targetRole === 'volunteer' && cleanPin === defaultVolunteerPin) {
      matchedUser = {
        id: 'desk-volunteer',
        email: 'volunteer-desk@eventpass.internal',
        full_name: 'Check-in Desk Volunteer',
        role: 'volunteer',
        pin_code: cleanPin
      };
    } else {
      // Check if any registered user matches this role & pin
      const allUsers = getLocalUsers();
      const found = allUsers.find(u => u.role === targetRole && u.pin_code === cleanPin);
      if (found) {
        matchedUser = found;
      }
    }

    if (!matchedUser) {
      await logAudit({
        action: 'FAILED_PIN_LOGIN',
        role: targetRole,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(401).json({
        success: false,
        error: `Incorrect PIN for ${targetRole} role. (Hint: Organizer PIN is ${defaultOrganizerPin}, Volunteer PIN is ${defaultVolunteerPin})`
      });
    }

    await logAudit({
      userId: matchedUser.id,
      email: matchedUser.email,
      action: 'PIN_LOGIN',
      role: matchedUser.role,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    const token = generateToken(matchedUser);

    return res.json({
      success: true,
      message: `Rapid desk access authorized as ${matchedUser.role.toUpperCase()}.`,
      token,
      user: {
        id: matchedUser.id,
        email: matchedUser.email,
        fullName: matchedUser.full_name,
        role: matchedUser.role,
        pinCode: matchedUser.pin_code
      }
    });
  } catch (err) {
    console.error('[Auth PIN Login Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred during PIN verification.'
    });
  }
});

// ----------------------------------------------------
// 4. GET CURRENT USER PROFILE (/me)
// ----------------------------------------------------
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      // Fallback to token payload if user record is ephemeral
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
        role: user.role,
        pinCode: user.pin_code
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

// ----------------------------------------------------
// 5. LOGOUT
// ----------------------------------------------------
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

    return res.json({
      success: true,
      message: 'Signed out successfully.'
    });
  } catch (err) {
    return res.json({ success: true, message: 'Logged out.' });
  }
});

// ----------------------------------------------------
// 6. STATUS & DEMO ACCOUNTS HELPER
// ----------------------------------------------------
router.get('/status', (req, res) => {
  res.json({
    success: true,
    supabaseConfigured: isSupabaseConfigured(),
    mode: isSupabaseConfigured() ? 'Supabase Database Active' : 'Local Fallback Active',
    demoAccounts: [
      {
        role: 'organizer',
        name: 'Bhavesh Thadhani',
        email: 'bhavesh@eventpass.edu',
        password: 'admin123',
        pin: '9999'
      },
      {
        role: 'organizer',
        name: 'Aniket Hinge',
        email: 'aniket@eventpass.edu',
        password: 'admin123',
        pin: '8888'
      },
      {
        role: 'volunteer',
        name: 'Karan (Desk Volunteer)',
        email: 'karan@eventpass.edu',
        password: 'volunteer123',
        pin: '1234'
      },
      {
        role: 'attendee',
        name: 'Ananya Kulkarni',
        email: 'ananya@eventpass.edu',
        password: 'attendee123',
        pin: '0000'
      }
    ]
  });
});

module.exports = router;
