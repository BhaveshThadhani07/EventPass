/**
 * EventPass - Supabase Client & Data Layer
 * Handles persistence in Supabase PostgreSQL with local JSON fallback
 * when Supabase credentials are not yet configured.
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

const LOCAL_STORE_FILE = path.join(__dirname, 'local_auth_store.json');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function persistLocalStore(data) {
  if (process.env.VERCEL) return;
  fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getDefaultEvents() {
  const now = new Date().toISOString();
  return [
    {
      id: 'E01',
      name: 'OJT Sprint Demo Day',
      venue: 'Innovation Lab',
      event_date: 'Nov 30, 2026',
      capacity: 200,
      status: 'active',
      description: 'Live full-stack architecture and Liquid Glass UI evaluation with faculty mentors.',
      active_qr_code: null,
      created_at: now
    },
    {
      id: 'E02',
      name: 'Bengaluru Student Hackathon',
      venue: 'Open Arena',
      event_date: 'Dec 09, 2026',
      capacity: 350,
      status: 'active',
      description: '24-hour rapid build sprint with instant roster sync.',
      active_qr_code: null,
      created_at: now
    },
    {
      id: 'E03',
      name: 'Winter Open-Source Code Sprint',
      venue: 'Tech Hub',
      event_date: 'Dec 18, 2026',
      capacity: 120,
      status: 'active',
      description: 'Collaborative pull-request sprint and mentor code review session.',
      active_qr_code: null,
      created_at: now
    },
    {
      id: 'E04',
      name: 'Constellation 2026 Campus Launch',
      venue: 'Main Auditorium',
      event_date: 'Aug 24, 2026',
      capacity: 500,
      status: 'passive',
      description: 'Polaris School of Technology orientation showcase and campus event launch.',
      active_qr_code: null,
      created_at: now
    },
    {
      id: 'E05',
      name: 'Cloud & Applied AI Track Workshop',
      venue: 'Seminar Hall B',
      event_date: 'Oct 15, 2026',
      capacity: 200,
      status: 'passive',
      description: 'Hands-on deployment lab covering cloud runtimes, API authentication, and telemetry.',
      active_qr_code: null,
      created_at: now
    },
    {
      id: 'E06',
      name: 'Freshers Induction & Club Fair',
      venue: 'Central Courtyard',
      event_date: 'Sep 05, 2026',
      capacity: 550,
      status: 'passive',
      description: 'Past campus induction event retained for audit and OJT reporting.',
      active_qr_code: null,
      created_at: now
    }
  ];
}

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
      gate_checked_in: false,
      gate_checked_in_at: null,
      meal_claimed: false,
      meal_claimed_at: null,
      duplicate_attempts: 0
    },
    {
      ticket_id: 'EP-B2XK-9HDR',
      event_id: 'E04',
      full_name: 'Ananya Kulkarni',
      email: 'ananya@eventpass.edu',
      diet: 'Veg',
      registered_at: new Date(now - 86400000).toISOString(),
      gate_checked_in: true,
      gate_checked_in_at: new Date(now - 86000000).toISOString(),
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
      gate_checked_in: true,
      gate_checked_in_at: new Date(now - 1800000).toISOString(),
      meal_claimed: false,
      meal_claimed_at: null,
      duplicate_attempts: 0
    }
  ];
}

function getDefaultNotifications() {
  const now = Date.now();
  return [
    {
      id: 'notif-1',
      user_email: '*',
      title: 'Ongoing Event: OJT Sprint Demo Day',
      body: 'Gate check-in is open at Innovation Lab.',
      unread: true,
      created_at: new Date(now - 720000).toISOString()
    },
    {
      id: 'notif-2',
      user_email: '*',
      title: 'Bengaluru Student Hackathon',
      body: 'Team registrations are now live for Open Arena.',
      unread: true,
      created_at: new Date(now - 7200000).toISOString()
    }
  ];
}

function getDefaultChatMessages() {
  const now = Date.now();
  return [
    {
      id: 'chat-1',
      sender_name: 'OJT Coordinator Desk',
      sender_email: 'bhavesh@eventpass.edu',
      sender_role: 'organizer',
      message: 'Welcome to EventPass! Register for any active event and scan the gate QR code on arrival.',
      created_at: new Date(now - 3600000).toISOString()
    },
    {
      id: 'chat-2',
      sender_name: 'Gate Lead (Innovation Lab)',
      sender_email: 'aniket@eventpass.edu',
      sender_role: 'organizer',
      message: 'Reminder: Keep your QR scanner ready when arriving at the venue.',
      created_at: new Date(now - 1800000).toISOString()
    }
  ];
}

function initLocalStore() {
  if (fs.existsSync(LOCAL_STORE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf8'));
      if (data && Array.isArray(data.users)) {
        let updated = false;
        if (!Array.isArray(data.auditLogs)) {
          data.auditLogs = [];
          updated = true;
        }
        if (!Array.isArray(data.events) || data.events.length < 2 || !data.events[0].status) {
          data.events = getDefaultEvents();
          updated = true;
        }
        if (!Array.isArray(data.tickets)) {
          data.tickets = getSampleTickets();
          updated = true;
        }
        if (!Array.isArray(data.notifications)) {
          data.notifications = getDefaultNotifications();
          updated = true;
        }
        if (!Array.isArray(data.chatMessages)) {
          data.chatMessages = getDefaultChatMessages();
          updated = true;
        }
        if (updated) {
          persistLocalStore(data);
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
  const now = new Date().toISOString();

  const initialData = {
    users: [
      {
        id: 'usr-org-01',
        email: 'bhavesh@eventpass.edu',
        password_hash: defaultHash,
        full_name: 'Bhavesh Thadhani',
        role: 'organizer',
        created_at: now,
        updated_at: now
      },
      {
        id: 'usr-org-02',
        email: 'aniket@eventpass.edu',
        password_hash: defaultHash,
        full_name: 'Aniket Hinge',
        role: 'organizer',
        created_at: now,
        updated_at: now
      },
      {
        id: 'usr-vol-01',
        email: 'karan@eventpass.edu',
        password_hash: volunteerHash,
        full_name: 'Karan (Desk Volunteer)',
        role: 'volunteer',
        created_at: now,
        updated_at: now
      },
      {
        id: 'usr-att-01',
        email: 'ananya@eventpass.edu',
        password_hash: attendeeHash,
        full_name: 'Ananya Kulkarni',
        role: 'attendee',
        created_at: now,
        updated_at: now
      }
    ],
    auditLogs: [],
    events: getDefaultEvents(),
    tickets: getSampleTickets(),
    notifications: getDefaultNotifications(),
    chatMessages: getDefaultChatMessages()
  };

  persistLocalStore(initialData);
  return initialData;
}

let localStore = initLocalStore();

function saveLocalStore() {
  try {
    persistLocalStore(localStore);
  } catch (err) {
    console.error('[LocalStore] Failed to save store:', err.message);
  }
}

// ----------------------------------------------------
// User Operations
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

      if (error) console.warn('[Supabase] findUserByEmail error:', error.message);
      else if (data) return data;
    } catch (err) {
      console.warn('[Supabase] findUserByEmail catch:', err.message);
    }
  }

  return localStore.users.find(u => u.email.toLowerCase() === normalizedEmail) || null;
}

async function findUserById(id) {
  if (isConfigured && supabase && UUID_REGEX.test(String(id || ''))) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .eq('id', id)
        .maybeSingle();

      if (error) console.warn('[Supabase] findUserById error:', error.message);
      else if (data) return data;
    } catch (err) {
      console.warn('[Supabase] findUserById catch:', err.message);
    }
  }

  const user = localStore.users.find(u => u.id === id);
  if (!user) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

async function createUser({ email, passwordHash, fullName, role }) {
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
            created_at: now,
            updated_at: now
          }
        ])
        .select()
        .single();

      if (!error && data) return data;
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
    ...auditEntry
  });
  if (localStore.auditLogs.length > 200) localStore.auditLogs.pop();
  saveLocalStore();
}

// ----------------------------------------------------
// Event & Ticket Operations
// ----------------------------------------------------
function mapEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    venue: row.venue || '',
    date: row.event_date || '',
    capacity: Number(row.capacity || 100),
    status: row.status || 'active',
    description: row.description || '',
    activeQrCode: row.active_qr_code || null
  };
}

function mapTicketRow(row) {
  if (!row) return null;
  return {
    ticketId: row.ticket_id,
    eventId: row.event_id,
    fullName: row.full_name,
    email: row.email,
    diet: row.diet || 'Veg',
    registeredAt: row.registered_at,
    gateCheckedIn: Boolean(row.gate_checked_in),
    gateCheckedInAt: row.gate_checked_in_at || null,
    mealClaimed: Boolean(row.meal_claimed),
    mealClaimedAt: row.meal_claimed_at || null,
    duplicateAttempts: Number(row.duplicate_attempts || 0)
  };
}

async function listEvents() {
  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('events')
      .select('id, name, venue, event_date, capacity, status, description, active_qr_code')
      .order('id', { ascending: true });

    if (error) throw new Error(`Supabase listEvents failed: ${error.message}`);
    return (data || []).map(mapEventRow);
  }

  return (localStore.events || []).map(mapEventRow);
}

async function getEvent(eventId = 'E01') {
  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('events')
      .select('id, name, venue, event_date, capacity, status, description, active_qr_code')
      .eq('id', eventId)
      .maybeSingle();

    if (error) throw new Error(`Supabase getEvent failed: ${error.message}`);
    if (data) return mapEventRow(data);
  }

  const ev = (localStore.events || []).find(e => e.id === eventId);
  return mapEventRow(ev) || mapEventRow(getDefaultEvents()[0]);
}

async function setEventQrCode(eventId, qrCode) {
  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('events')
      .update({ active_qr_code: qrCode })
      .eq('id', eventId)
      .select('id, name, venue, event_date, capacity, status, description, active_qr_code')
      .single();

    if (error) throw new Error(`Supabase setEventQrCode failed: ${error.message}`);
    return mapEventRow(data);
  }

  const idx = (localStore.events || []).findIndex(e => e.id === eventId);
  if (idx === -1) return null;
  localStore.events[idx].active_qr_code = qrCode;
  saveLocalStore();
  return mapEventRow(localStore.events[idx]);
}

async function listTickets(eventId = null) {
  if (isConfigured && supabase) {
    let query = supabase.from('tickets').select('*').order('registered_at', { ascending: true });
    if (eventId) query = query.eq('event_id', eventId);
    const { data, error } = await query;
    if (error) throw new Error(`Supabase listTickets failed: ${error.message}`);
    return (data || []).map(mapTicketRow);
  }

  const rows = localStore.tickets || [];
  return (eventId ? rows.filter(t => t.event_id === eventId) : rows).map(mapTicketRow);
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

    if (error) throw new Error(`Supabase findTicketByEmail failed: ${error.message}`);
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

    if (error) throw new Error(`Supabase findTicketById failed: ${error.message}`);
    return mapTicketRow(data);
  }

  const found = (localStore.tickets || []).find(t => t.ticket_id === normalizedId);
  return mapTicketRow(found);
}

async function createTicket({ ticketId, eventId = 'E01', fullName, email, diet = 'Veg', gateCheckedIn = false, gateCheckedInAt = null }) {
  const row = {
    ticket_id: ticketId,
    event_id: eventId,
    full_name: fullName.trim(),
    email: email.trim().toLowerCase(),
    diet,
    gate_checked_in: gateCheckedIn,
    gate_checked_in_at: gateCheckedInAt,
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

    if (error) throw new Error(`Supabase createTicket failed: ${error.message}`);
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

    if (error) throw new Error(`Supabase updateTicketById failed: ${error.message}`);
    return mapTicketRow(data);
  }

  const idx = (localStore.tickets || []).findIndex(t => t.ticket_id === normalizedId);
  if (idx === -1) return null;
  localStore.tickets[idx] = { ...localStore.tickets[idx], ...patch };
  saveLocalStore();
  return mapTicketRow(localStore.tickets[idx]);
}

async function resetTickets(eventId = 'E01') {
  const samples = getSampleTickets().filter(s => s.event_id === eventId);

  if (isConfigured && supabase) {
    const { error: delError } = await supabase.from('tickets').delete().eq('event_id', eventId);
    if (delError) throw new Error(`Supabase resetTickets delete failed: ${delError.message}`);
    if (samples.length === 0) return [];
    const { data, error: insError } = await supabase.from('tickets').insert(samples).select();
    if (insError) throw new Error(`Supabase resetTickets insert failed: ${insError.message}`);
    return (data || []).map(mapTicketRow);
  }

  localStore.tickets = [
    ...(localStore.tickets || []).filter(t => t.event_id !== eventId),
    ...samples
  ];
  saveLocalStore();
  return samples.map(mapTicketRow);
}

// ----------------------------------------------------
// Notifications & Chat Operations
// ----------------------------------------------------
async function listNotifications(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, user_email, title, body, unread, created_at')
      .in('user_email', [normalizedEmail, '*'])
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw new Error(`Supabase listNotifications failed: ${error.message}`);
    return (data || []).map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      unread: Boolean(n.unread),
      createdAt: n.created_at
    }));
  }

  return (localStore.notifications || [])
    .filter(n => n.user_email === normalizedEmail || n.user_email === '*')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 20)
    .map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      unread: Boolean(n.unread),
      createdAt: n.created_at
    }));
}

async function createNotification({ userEmail, title, body }) {
  const entry = {
    user_email: String(userEmail || '*').trim().toLowerCase(),
    title,
    body,
    unread: true,
    created_at: new Date().toISOString()
  };

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('notifications')
      .insert([entry])
      .select()
      .single();
    if (!error && data) return data;
  }

  const localEntry = { id: 'notif-' + Date.now(), ...entry };
  localStore.notifications.unshift(localEntry);
  if (localStore.notifications.length > 100) localStore.notifications.pop();
  saveLocalStore();
  return localEntry;
}

async function markAllNotificationsRead(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (isConfigured && supabase) {
    const { error } = await supabase
      .from('notifications')
      .update({ unread: false })
      .in('user_email', [normalizedEmail, '*'])
      .eq('unread', true);
    if (error) throw new Error(`Supabase markAllNotificationsRead failed: ${error.message}`);
    return true;
  }

  localStore.notifications = (localStore.notifications || []).map(n =>
    n.user_email === normalizedEmail || n.user_email === '*' ? { ...n, unread: false } : n
  );
  saveLocalStore();
  return true;
}

async function listChatMessages() {
  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, sender_name, sender_email, sender_role, message, created_at')
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) throw new Error(`Supabase listChatMessages failed: ${error.message}`);
    return (data || []).map(m => ({
      id: m.id,
      senderName: m.sender_name,
      senderEmail: m.sender_email,
      senderRole: m.sender_role,
      message: m.message,
      createdAt: m.created_at
    }));
  }

  return (localStore.chatMessages || [])
    .slice(-50)
    .map(m => ({
      id: m.id,
      senderName: m.sender_name,
      senderEmail: m.sender_email,
      senderRole: m.sender_role,
      message: m.message,
      createdAt: m.created_at
    }));
}

async function createChatMessage({ senderName, senderEmail, senderRole, message }) {
  const entry = {
    sender_name: senderName,
    sender_email: senderEmail,
    sender_role: senderRole,
    message: message.trim(),
    created_at: new Date().toISOString()
  };

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([entry])
      .select()
      .single();
    if (error) throw new Error(`Supabase createChatMessage failed: ${error.message}`);
    return {
      id: data.id,
      senderName: data.sender_name,
      senderEmail: data.sender_email,
      senderRole: data.sender_role,
      message: data.message,
      createdAt: data.created_at
    };
  }

  const localEntry = { id: 'chat-' + Date.now(), ...entry };
  localStore.chatMessages.push(localEntry);
  if (localStore.chatMessages.length > 100) localStore.chatMessages.shift();
  saveLocalStore();
  return {
    id: localEntry.id,
    senderName: localEntry.sender_name,
    senderEmail: localEntry.sender_email,
    senderRole: localEntry.sender_role,
    message: localEntry.message,
    createdAt: localEntry.created_at
  };
}

async function createEvent({ id, name, venue, date, capacity = 100, description = '' }) {
  const row = {
    id,
    name: name.trim(),
    venue: (venue || 'Campus Venue').trim(),
    event_date: (date || 'TBD').trim(),
    capacity: Math.max(1, Number(capacity) || 100),
    status: 'active',
    description: (description || '').trim(),
    active_qr_code: null,
    created_at: new Date().toISOString()
  };

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('events')
      .insert([row])
      .select('id, name, venue, event_date, capacity, status, description, active_qr_code')
      .single();

    if (error) throw new Error(`Supabase createEvent failed: ${error.message}`);
    return mapEventRow(data);
  }

  localStore.events.unshift(row);
  saveLocalStore();
  return mapEventRow(row);
}

async function updateEventStatus(eventId, status) {
  const nextStatus = status === 'passive' ? 'passive' : 'active';

  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('events')
      .update({ status: nextStatus })
      .eq('id', eventId)
      .select('id, name, venue, event_date, capacity, status, description, active_qr_code')
      .single();

    if (error) throw new Error(`Supabase updateEventStatus failed: ${error.message}`);
    return mapEventRow(data);
  }

  const idx = (localStore.events || []).findIndex(e => e.id === eventId);
  if (idx === -1) return null;
  localStore.events[idx].status = nextStatus;
  saveLocalStore();
  return mapEventRow(localStore.events[idx]);
}

module.exports = {
  supabase,
  isSupabaseConfigured: () => isConfigured,
  findUserByEmail,
  findUserById,
  createUser,
  logAudit,
  listEvents,
  getEvent,
  createEvent,
  updateEventStatus,
  setEventQrCode,
  listTickets,
  findTicketByEmail,
  findTicketById,
  createTicket,
  updateTicketById,
  resetTickets,
  listNotifications,
  createNotification,
  markAllNotificationsRead,
  listChatMessages,
  createChatMessage
};
