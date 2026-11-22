/**
 * EventPass - Supabase Client & Data Layer
 * Handles authentication data persistence in Supabase PostgreSQL (profiles table)
 * with graceful local fallback if Supabase credentials are not yet configured.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
let isConfigured = false;

// Check if valid Supabase credentials were provided
if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http') && !supabaseUrl.includes('your-project')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    isConfigured = true;
    console.log('[Supabase] Initialized with URL:', supabaseUrl);
  } catch (err) {
    console.warn('[Supabase] Initialization warning:', err.message);
  }
} else {
  console.log('[Supabase] No credentials configured. Running in Local Storage Mode (seed data active).');
}

// Local Storage Fallback implementation (persisted to local_auth_store.json)
const LOCAL_STORE_FILE = path.join(__dirname, 'local_auth_store.json');

// Initialize local database with default college project users
function initLocalStore() {
  if (fs.existsSync(LOCAL_STORE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf8'));
      if (data && data.users && Array.isArray(data.users)) {
        return data;
      }
    } catch (e) {
      console.warn('[LocalStore] Could not parse local store, re-seeding...');
    }
  }

  const salt = bcrypt.genSaltSync(10);
  const defaultHash = bcrypt.hashSync('admin123', salt);
  const volunteerHash = bcrypt.hashSync('volunteer123', salt);
  const attendeeHash = bcrypt.hashSync('attendee123', salt);

  const initialData = {
    users: [
      {
        id: 'usr-org-01',
        email: 'bhavesh@eventpass.edu',
        password_hash: defaultHash,
        full_name: 'Bhavesh Thadhani',
        role: 'organizer',
        pin_code: '9999',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'usr-org-02',
        email: 'aniket@eventpass.edu',
        password_hash: defaultHash,
        full_name: 'Aniket Hinge',
        role: 'organizer',
        pin_code: '8888',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'usr-vol-01',
        email: 'karan@eventpass.edu',
        password_hash: volunteerHash,
        full_name: 'Karan (Desk Volunteer)',
        role: 'volunteer',
        pin_code: '1234',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'usr-att-01',
        email: 'ananya@eventpass.edu',
        password_hash: attendeeHash,
        full_name: 'Ananya Kulkarni',
        role: 'attendee',
        pin_code: '0000',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    auditLogs: []
  };

  fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  return initialData;
}

let localStore = initLocalStore();

function saveLocalStore() {
  try {
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(localStore, null, 2), 'utf8');
  } catch (err) {
    console.error('[LocalStore] Failed to save store:', err.message);
  }
}

// ----------------------------------------------------
// Database Operations (Supabase with Local Fallback)
// ----------------------------------------------------

async function findUserByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();

  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (error) {
        console.warn('[Supabase] findUserByEmail error:', error.message);
      } else if (data) {
        return data;
      }
    } catch (err) {
      console.warn('[Supabase] findUserByEmail catch:', err.message);
    }
  }

  // Fallback to local store
  return localStore.users.find(u => u.email.toLowerCase() === normalizedEmail) || null;
}

async function findUserById(id) {
  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, pin_code, created_at')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.warn('[Supabase] findUserById error:', error.message);
      } else if (data) {
        return data;
      }
    } catch (err) {
      console.warn('[Supabase] findUserById catch:', err.message);
    }
  }

  const user = localStore.users.find(u => u.id === id);
  if (!user) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

async function createUser({ email, passwordHash, fullName, role, pinCode }) {
  const normalizedEmail = email.trim().toLowerCase();
  const id = 'usr-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
  const now = new Date().toISOString();

  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert([
          {
            email: normalizedEmail,
            password_hash: passwordHash,
            full_name: fullName.trim(),
            role: role || 'attendee',
            pin_code: pinCode || '1234',
            created_at: now,
            updated_at: now
          }
        ])
        .select()
        .single();

      if (!error && data) {
        return data;
      }
      console.warn('[Supabase] createUser error, falling back to local store:', error?.message);
    } catch (err) {
      console.warn('[Supabase] createUser exception:', err.message);
    }
  }

  const newUser = {
    id,
    email: normalizedEmail,
    password_hash: passwordHash,
    full_name: fullName.trim(),
    role: role || 'attendee',
    pin_code: pinCode || '1234',
    created_at: now,
    updated_at: now
  };

  localStore.users.push(newUser);
  saveLocalStore();
  return newUser;
}

async function logAudit({ userId, email, action, role, ip, userAgent }) {
  const auditEntry = {
    user_id: userId || null,
    email: email || 'unknown',
    action,
    role: role || null,
    ip_address: ip || '127.0.0.1',
    user_agent: userAgent || 'Browser',
    created_at: new Date().toISOString()
  };

  if (isConfigured && supabase) {
    try {
      await supabase.from('auth_audit_logs').insert([auditEntry]);
      return;
    } catch (err) {
      // Ignore audit fail
    }
  }

  localStore.auditLogs.unshift({
    id: 'log-' + Date.now(),
    ...auditEntry
  });
  if (localStore.auditLogs.length > 200) localStore.auditLogs.pop();
  saveLocalStore();
}

module.exports = {
  supabase,
  isSupabaseConfigured: () => isConfigured,
  findUserByEmail,
  findUserById,
  createUser,
  logAudit,
  getLocalUsers: () => localStore.users.map(({ password_hash, ...u }) => u)
};
