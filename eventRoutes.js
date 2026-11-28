/**
 * EventPass - Event, Ticket, QR Check-in, Notifications & Chat Routes
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const {
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
} = require('./supabaseClient');
const { authenticateToken, requireRole } = require('./authMiddleware');

const DEFAULT_EVENT_ID = 'E01';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_DIETS = ['Veg', 'Non-Veg', 'Jain', 'Vegan'];
const TICKET_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateTicketId() {
  const bytes = crypto.randomBytes(8);
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) part1 += TICKET_ALPHABET[bytes[i] % TICKET_ALPHABET.length];
  for (let i = 4; i < 8; i++) part2 += TICKET_ALPHABET[bytes[i] % TICKET_ALPHABET.length];
  return `EP-${part1}-${part2}`;
}

function normalizeTicketId(raw) {
  let ticketId = String(raw || '').trim().toUpperCase();
  if (ticketId.length === 10 && !ticketId.includes('-')) {
    ticketId = `${ticketId.slice(0, 2)}-${ticketId.slice(2, 6)}-${ticketId.slice(6, 10)}`;
  }
  return ticketId;
}

async function generateUniqueTicketId() {
  let ticketId = generateTicketId();
  for (let i = 0; i < 5; i++) {
    const collision = await findTicketById(ticketId);
    if (!collision) break;
    ticketId = generateTicketId();
  }
  return ticketId;
}

// 1. GET SINGLE DEFAULT EVENT (Public)
router.get('/event', async (req, res) => {
  try {
    const event = await getEvent(DEFAULT_EVENT_ID);
    const tickets = await listTickets(event.id);
    const seatsTaken = tickets.length;
    const seatsRemaining = Math.max(0, event.capacity - seatsTaken);
    return res.json({ success: true, event, seatsTaken, seatsRemaining });
  } catch (err) {
    console.error('[Event GET Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to load event details.' });
  }
});

// 2. GET ALL EVENTS + USER'S TICKET STATUS (Authenticated)
router.get('/events', authenticateToken, async (req, res) => {
  try {
    const events = await listEvents();
    const allTickets = await listTickets();
    const userEmail = String(req.user.email || '').toLowerCase();

    const enriched = events.map(ev => {
      const evTickets = allTickets.filter(t => t.eventId === ev.id);
      const checkedInCount = evTickets.filter(t => t.gateCheckedIn).length;
      const myTicket = evTickets.find(t => t.email.toLowerCase() === userEmail) || null;
      return {
        ...ev,
        registeredCount: evTickets.length,
        checkedInCount,
        spotsLeft: Math.max(0, ev.capacity - evTickets.length),
        myTicket
      };
    });

    return res.json({ success: true, events: enriched });
  } catch (err) {
    console.error('[Events List Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to load events.' });
  }
});

// 2b. ORGANIZE / CREATE NEW EVENT
router.post('/events', authenticateToken, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const venue = String(req.body.venue || '').trim();
    const date = String(req.body.date || '').trim();
    const capacity = Number(req.body.capacity || 100);
    const description = String(req.body.description || '').trim();

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ success: false, error: 'Event name must be 2–80 characters.' });
    }
    if (!venue) {
      return res.status(400).json({ success: false, error: 'Please enter a venue.' });
    }
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 5000) {
      return res.status(400).json({ success: false, error: 'Capacity must be between 1 and 5000.' });
    }

    const existing = await listEvents();
    const nextNum = existing.length + 1;
    const id = 'E' + String(nextNum).padStart(2, '0') + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();

    const event = await createEvent({
      id,
      name,
      venue,
      date: date || 'Upcoming',
      capacity: Math.round(capacity),
      description: description || `Organized by ${req.user.fullName || req.user.email}.`
    });

    await createNotification({
      userEmail: '*',
      title: `New Event: ${event.name}`,
      body: `${event.date} at ${event.venue}. Registration is now open!`
    });

    return res.status(201).json({ success: true, event });
  } catch (err) {
    console.error('[Event Create Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to create event.' });
  }
});

// 2c. TOGGLE EVENT ACTIVE / PASSIVE STATUS
router.post('/events/:eventId/status', authenticateToken, async (req, res) => {
  try {
    const status = req.body.status === 'passive' ? 'passive' : 'active';
    const updated = await updateEventStatus(req.params.eventId, status);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }
    return res.json({ success: true, event: updated });
  } catch (err) {
    console.error('[Event Status Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to update event status.' });
  }
});

// 3. GENERATE SCANNABLE EVENT QR TOKEN
router.post('/events/:eventId/qr', authenticateToken, async (req, res) => {
  try {
    const event = await getEvent(req.params.eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    const codeNum = Math.floor(1000 + Math.random() * 9000);
    const token = crypto.randomBytes(4).toString('hex').toUpperCase();
    const passId = `#EP-2026-${codeNum}-${token.slice(0, 4)}`;

    await setEventQrCode(event.id, passId);

    const qrPayload = JSON.stringify({
      app: 'EventPass',
      eventId: event.id,
      event: event.name,
      passId,
      issuedBy: req.user.email,
      issuedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      eventId: event.id,
      eventName: event.name,
      passId,
      qrPayload,
      issuedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Event QR Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate event QR.' });
  }
});

// 4. REGISTER FOR AN EVENT (Authenticated user or direct attendee registration)
router.post('/tickets/register', async (req, res) => {
  try {
    const eventId = req.body.eventId || DEFAULT_EVENT_ID;
    const fullName = String(req.body.fullName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const diet = ALLOWED_DIETS.includes(req.body.diet) ? req.body.diet : 'Veg';

    if (fullName.length < 2 || fullName.length > 60) {
      return res.status(400).json({ success: false, error: 'Please enter a valid full name.' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    const event = await getEvent(eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    const existingTickets = await listTickets(event.id);
    if (existingTickets.length >= event.capacity) {
      return res.status(409).json({
        success: false,
        error: `This event is at full capacity (${event.capacity} seats taken).`
      });
    }

    const existing = await findTicketByEmail(event.id, email);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Already registered. Ticket ID: ${existing.ticketId}`,
        existingTicketId: existing.ticketId,
        ticket: existing
      });
    }

    const ticketId = await generateUniqueTicketId();
    const ticket = await createTicket({
      ticketId,
      eventId: event.id,
      fullName,
      email,
      diet
    });

    await createNotification({
      userEmail: email,
      title: `Pass Issued: ${event.name}`,
      body: `Your ticket ${ticket.ticketId} is confirmed for ${event.venue || 'the event'}.`
    });

    const seatsTaken = existingTickets.length + 1;
    return res.status(201).json({
      success: true,
      message: `Ticket ${ticket.ticketId} issued for ${event.name}.`,
      ticket,
      seatsTaken,
      seatsRemaining: Math.max(0, event.capacity - seatsTaken),
      capacity: event.capacity
    });
  } catch (err) {
    console.error('[Ticket Register Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to register for event.' });
  }
});

// 5. ATTENDEE QR CHECK-IN (Scans Organizer QR or enters event/pass code)
router.post('/tickets/checkin', authenticateToken, async (req, res) => {
  try {
    const raw = String(req.body.rawPayload || req.body.code || '').trim();
    let eventId = req.body.eventId || null;
    let qrPassId = req.body.passId || null;

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.eventId) eventId = parsed.eventId;
        if (parsed.passId) qrPassId = parsed.passId;
      } catch {
        // Plain code entered: could be an Event ID (E01), QR passId (#EP-...), or Ticket ID (EP-...)
        const upper = raw.toUpperCase();
        const events = await listEvents();
        const matchedEvent = events.find(
          e => e.id.toUpperCase() === upper || (e.activeQrCode && e.activeQrCode.toUpperCase() === upper)
        );
        if (matchedEvent) {
          eventId = matchedEvent.id;
        } else {
          const ticket = await findTicketById(normalizeTicketId(upper));
          if (ticket) eventId = ticket.eventId;
        }
      }
    }

    if (!eventId) {
      return res.status(404).json({
        success: false,
        resultStatus: 'NOT_FOUND',
        error: 'Unrecognized EventPass QR or code.'
      });
    }

    const event = await getEvent(eventId);
    if (!event || event.status === 'passive') {
      return res.status(400).json({
        success: false,
        resultStatus: 'INACTIVE',
        error: 'This event is closed or archived.'
      });
    }

    if (qrPassId && event.activeQrCode && event.activeQrCode !== qrPassId) {
      return res.status(409).json({
        success: false,
        resultStatus: 'EXPIRED_QR',
        error: 'This QR code has been replaced by a newer organizer QR. Please scan the latest QR.'
      });
    }

    const email = String(req.user.email || '').toLowerCase();
    const fullName = req.user.fullName || email.split('@')[0];
    const nowIso = new Date().toISOString();

    let ticket = await findTicketByEmail(event.id, email);
    if (!ticket) {
      const ticketId = await generateUniqueTicketId();
      ticket = await createTicket({
        ticketId,
        eventId: event.id,
        fullName,
        email,
        diet: 'Veg',
        gateCheckedIn: true,
        gateCheckedInAt: nowIso
      });
    } else if (ticket.gateCheckedIn) {
      const updated = await updateTicketById(ticket.ticketId, {
        duplicateAttempts: (ticket.duplicateAttempts || 0) + 1
      });
      return res.status(409).json({
        success: false,
        resultStatus: 'DUPLICATE',
        event,
        ticket: updated,
        error: `Already checked in to ${event.name}.`
      });
    } else {
      ticket = await updateTicketById(ticket.ticketId, {
        gateCheckedIn: true,
        gateCheckedInAt: nowIso
      });
    }

    await createNotification({
      userEmail: email,
      title: `Checked In: ${event.name}`,
      body: `Gate check-in verified (${ticket.ticketId}) at ${event.venue || 'venue'}.`
    });

    return res.json({
      success: true,
      resultStatus: 'VALID',
      event,
      ticket
    });
  } catch (err) {
    console.error('[Ticket Checkin Error]:', err);
    return res.status(500).json({ success: false, error: 'Check-in failed.' });
  }
});

// 6. ORGANIZER TICKET VERIFY & STATS
router.post('/tickets/verify', authenticateToken, requireRole(['organizer', 'volunteer']), async (req, res) => {
  try {
    const mode = req.body.mode === 'meal' ? 'meal' : 'gate';
    const ticketId = normalizeTicketId(req.body.ticketId);

    if (!ticketId) {
      return res.status(400).json({ success: false, resultStatus: 'INVALID_INPUT', error: 'Please enter a ticket ID.' });
    }

    const ticket = await findTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, resultStatus: 'NOT_FOUND', ticketId, error: `No ticket "${ticketId}" found.` });
    }

    const nowIso = new Date().toISOString();

    if (mode === 'gate') {
      if (ticket.gateCheckedIn) {
        const updated = await updateTicketById(ticket.ticketId, { duplicateAttempts: (ticket.duplicateAttempts || 0) + 1 });
        return res.status(409).json({ success: false, resultStatus: 'DUPLICATE', ticket: updated, error: 'Duplicate check-in blocked.' });
      }
      const updated = await updateTicketById(ticket.ticketId, { gateCheckedIn: true, gateCheckedInAt: nowIso });
      return res.json({ success: true, resultStatus: 'VALID', ticket: updated });
    }

    if (!ticket.gateCheckedIn) {
      return res.status(409).json({ success: false, resultStatus: 'GATE_REQUIRED', ticket, error: 'Gate check-in required first.' });
    }
    if (ticket.mealClaimed) {
      return res.status(409).json({ success: false, resultStatus: 'DUPLICATE', ticket, error: 'Meal already claimed.' });
    }
    const updated = await updateTicketById(ticket.ticketId, { mealClaimed: true, mealClaimedAt: nowIso });
    return res.json({ success: true, resultStatus: 'VALID', ticket: updated });
  } catch (err) {
    console.error('[Ticket Verify Error]:', err);
    return res.status(500).json({ success: false, error: 'Failed to verify ticket pass.' });
  }
});

router.get('/tickets/stats', authenticateToken, requireRole(['organizer', 'volunteer']), async (req, res) => {
  try {
    const event = await getEvent(DEFAULT_EVENT_ID);
    const tickets = await listTickets(event.id);
    const totalRegistered = tickets.length;
    const insideCount = tickets.filter(t => t.gateCheckedIn).length;
    const mealsCount = tickets.filter(t => t.mealClaimed).length;
    const noShows = totalRegistered - insideCount;
    const seatsRemaining = Math.max(0, event.capacity - totalRegistered);

    return res.json({
      success: true,
      event,
      stats: { totalRegistered, insideCount, noShows, mealsCount, seatsRemaining, capacity: event.capacity }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load telemetry.' });
  }
});

router.get('/tickets', authenticateToken, requireRole(['organizer']), async (req, res) => {
  try {
    const tickets = await listTickets(req.query.eventId || null);
    return res.json({ success: true, tickets });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load roster.' });
  }
});

router.post('/tickets/reset', authenticateToken, requireRole(['organizer']), async (req, res) => {
  try {
    const tickets = await resetTickets(DEFAULT_EVENT_ID);
    return res.json({ success: true, tickets });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to reset sample data.' });
  }
});

// 7. NOTIFICATIONS
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await listNotifications(req.user.email);
    return res.json({ success: true, notifications });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load notifications.' });
  }
});

router.post('/notifications/read', authenticateToken, async (req, res) => {
  try {
    await markAllNotificationsRead(req.user.email);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update notifications.' });
  }
});

// 8. COORDINATOR CHAT
router.get('/chat', authenticateToken, async (req, res) => {
  try {
    const messages = await listChatMessages();
    return res.json({ success: true, messages });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load chat.' });
  }
});

router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const text = String(req.body.message || '').trim();
    if (!text) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty.' });
    }

    const msg = await createChatMessage({
      senderName: req.user.fullName || req.user.email,
      senderEmail: req.user.email,
      senderRole: req.user.role || 'attendee',
      message: text
    });

    return res.status(201).json({ success: true, message: msg });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to send message.' });
  }
});

module.exports = router;
