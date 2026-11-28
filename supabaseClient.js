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

const DEFAULT_EVENT = {
  id: 'E01',
  name: 'Intro to Web Dev Workshop',
  venue: 'Seminar Hall B',
  event_date: '2026-11-14',
  capacity: 50
};

function getSampleTickets() {
  const now = Date.now();
  return [
    {
      ticket_id: 'EP-7K3Q-X9M2',
      event_id: 'E01',
      full_name: 'Ananya Kulkarni',
      email: 'ananya@eventpass.edu',
      diet: 'Veg',
      registered_at: new Date(now - 3600000).toISOString(),
      gate_checked_in: true,
      gate_checked_in_at: new Date(now - 3000000).toISOString(),
      meal_claimed: true,
      meal_claimed_at: new Date(now - 1200000).toISOString(),
      duplicate_attempts: 0
    },
    {
      ticket_id: 'EP-B2XK-9HDR',
      event_id: 'E01',
      full_name: 'Sana Sheikh',
      email: 'sana@example.com',
      diet: 'Non-Veg',
      registered_at: new Date(now - 3000000).toISOString(),
      gate_checked_in: true,
      gate_checked_in_at: new Date(now - 2400000).toISOString(),
      meal_claimed: false,
      meal_claimed_at: null,
      duplicate_attempts: 0
    },
    {
      ticket_id: 'EP-4M8T-QW3N',
      event_id: 'E01',
      full_name: 'Rohan Patil',
      email: 'rohan@example.com',
      diet: 'Jain',
      registered_at: new Date(now - 2500000).toISOString(),
      gate_checked_in: false,
      gate_checked_in_at: null,
      meal_claimed: false,
      meal_claimed_at: null,
      duplicate_attempts: 0
    }
  ];
}

// Initialize local database with default college project users, event, and sample tickets
function initLocalStore() {
  if (fs.existsSync(LOCAL_STORE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf8'));
      if (data && data.users && Array.isArray(data.users)) {
        let updated = false;
        if (!Array.isArray(data.auditLogs)) {
          data.auditLogs = [];
          updated = true;
        }
        if (!Array.isArray(data.events) || data.events.length === 0) {
          data.events = [{ ...DEFAULT_EVENT, created_at: new Date().toISOString() }];
          updated = true;
        }
        if (!Array.isArray(data.tickets)) {
          data.tickets = getSampleTickets();
          updated = true;
        }
        if (updated) {
          fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
        }
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
    auditLogs: [],
    events: [{ ...DEFAULT_EVENT, created_at: new Date().toISOString() }],
    tickets: getSampleTickets()
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findUserById(id) {
  if (isConfigured && supabase && UUID_REGEX.test(String(id || ''))) {
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

async function findUserByRoleAndPin(role, pinCode) {
  const targetRole = String(role || '').toLowerCase();
  const cleanPin = String(pinCode || '').trim();

  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, pin_code, created_at')
        .eq('role', targetRole)
        .eq('pin_code', cleanPin)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('[Supabase] findUserByRoleAndPin error:', error.message);
      } else if (data) {
        return data;
      }
    } catch (err) {
      console.warn('[Supabase] findUserByRoleAndPin catch:', err.message);
    }
  }

  const found = localStore.users.find(u => u.role === targetRole && u.pin_code === cleanPin);
  if (!found) return null;
  const { password_hash, ...safeUser } = found;
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
  const safeUserId = UUID_REGEX.test(String(userId || '')) ? userId : null;
  const auditEntry = {
    user_id: safeUserId,
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
    user_id: userId || null,
    email: auditEntry.email,
    action: auditEntry.action,
    role: auditEntry.role,
    ip_address: auditEntry.ip_address,
    user_agent: auditEntry.user_agent,
    created_at: auditEntry.created_at
  });
  if (localStore.auditLogs.length > 200) localStore.auditLogs.pop();
  saveLocalStore();
}

// ----------------------------------------------------
// Event & Ticket Operations (Supabase with Local Fallback)
// ----------------------------------------------------

function mapTicketRow(row) {
  if (!row) return null;
  return {
    ticketId: row.ticket_id,
    eventId: row.event_id,
    fullName: row.full_name,
    email: row.email,
    diet: row.diet,
    registeredAt: row.registered_at,
    gateCheckedIn: Boolean(row.gate_checked_in),
    gateCheckedInAt: row.gate_checked_in_at || null,
    mealClaimed: Boolean(row.meal_claimed),
    mealClaimedAt: row.meal_claimed_at || null,
    duplicateAttempts: Number(row.duplicate_attempts || 0)
  };
}

async function getEvent(eventId = 'E01') {
  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('events')
      .select('id, name, venue, event_date, capacity')
      .eq('id', eventId)
      .maybeSingle();

    if (error) {
      console.warn('[Supabase] getEvent error:', error.message);
    } else if (data) {
      return {
        id: data.id,
        name: data.name,
        venue: data.venue,
        date: data.event_date,
        capacity: data.capacity
      };
    }
  }

  const ev = (localStore.events || []).find(e => e.id === eventId) || DEFAULT_EVENT;
  return {
    id: ev.id,
    name: ev.name,
    venue: ev.venue,
    date: ev.event_date,
    capacity: ev.capacity
  };
}

async function listTickets(eventId = 'E01') {
  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('event_id', eventId)
      .order('registered_at', { ascending: true });

    if (error) {
      throw new Error(`Supabase listTickets failed: ${error.message}`);
    }
    return (data || []).map(mapTicketRow);
  }

  return (localStore.tickets || [])
    .filter(t => t.event_id === eventId)
    .map(mapTicketRow);
}

async function findTicketByEmail(eventId = 'E01', email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('event_id', eventId)
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (error) {
      throw new Error(`Supabase findTicketByEmail failed: ${error.message}`);
    }
    return mapTicketRow(data);
  }

  const found = (localStore.tickets || []).find(
    t => t.event_id === eventId && t.email.toLowerCase() === normalizedEmail
  );
  return mapTicketRow(found);
}

async function findTicketById(ticketId) {
  const normalizedId = String(ticketId || '').trim().toUpperCase();

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('ticket_id', normalizedId)
      .maybeSingle();

    if (error) {
      throw new Error(`Supabase findTicketById failed: ${error.message}`);
    }
    return mapTicketRow(data);
  }

  const found = (localStore.tickets || []).find(t => t.ticket_id === normalizedId);
  return mapTicketRow(found);
}

async function createTicket({ ticketId, eventId = 'E01', fullName, email, diet }) {
  const row = {
    ticket_id: ticketId,
    event_id: eventId,
    full_name: fullName.trim(),
    email: email.trim().toLowerCase(),
    diet,
    gate_checked_in: false,
    gate_checked_in_at: null,
    meal_claimed: false,
    meal_claimed_at: null,
    duplicate_attempts: 0,
    registered_at: new Date().toISOString()
  };

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('tickets')
      .insert([row])
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase createTicket failed: ${error.message}`);
    }
    return mapTicketRow(data);
  }

  localStore.tickets.push(row);
  saveLocalStore();
  return mapTicketRow(row);
}

async function updateTicketById(ticketId, updates) {
  const normalizedId = String(ticketId || '').trim().toUpperCase();
  const patch = {};
  if ('gateCheckedIn' in updates) patch.gate_checked_in = updates.gateCheckedIn;
  if ('gateCheckedInAt' in updates) patch.gate_checked_in_at = updates.gateCheckedInAt;
  if ('mealClaimed' in updates) patch.meal_claimed = updates.mealClaimed;
  if ('mealClaimedAt' in updates) patch.meal_claimed_at = updates.mealClaimedAt;
  if ('duplicateAttempts' in updates) patch.duplicate_attempts = updates.duplicateAttempts;

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('tickets')
      .update(patch)
      .eq('ticket_id', normalizedId)
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase updateTicketById failed: ${error.message}`);
    }
    return mapTicketRow(data);
  }

  const idx = (localStore.tickets || []).findIndex(t => t.ticket_id === normalizedId);
  if (idx === -1) return null;
  localStore.tickets[idx] = { ...localStore.tickets[idx], ...patch };
  saveLocalStore();
  return mapTicketRow(localStore.tickets[idx]);
}

async function resetTickets(eventId = 'E01') {
  const samples = getSampleTickets().map(s => ({ ...s, event_id: eventId }));

  if (isConfigured && supabase) {
    const { error: delError } = await supabase
      .from('tickets')
      .delete()
      .eq('event_id', eventId);

    if (delError) {
      throw new Error(`Supabase resetTickets delete failed: ${delError.message}`);
    }

    const { data, error: insError } = await supabase
      .from('tickets')
      .insert(samples)
      .select();

    if (insError) {
      throw new Error(`Supabase resetTickets insert failed: ${insError.message}`);
    }
    return (data || []).map(mapTicketRow);
  }

  localStore.tickets = [
    ...(localStore.tickets || []).filter(t => t.event_id !== eventId),
    ...samples
  ];
  saveLocalStore();
  return samples.map(mapTicketRow);
}

module.exports = {
  supabase,
  isSupabaseConfigured: () => isConfigured,
  findUserByEmail,
  findUserById,
  findUserByRoleAndPin,
  createUser,
  logAudit,
  getLocalUsers: () => localStore.users.map(({ password_hash, ...u }) => u),
  getEvent,
  listTickets,
  findTicketByEmail,
  findTicketById,
  createTicket,
  updateTicketById,
  resetTickets
};
