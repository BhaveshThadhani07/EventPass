/**
 * EventPass - Event, Ticket Registration, Check-in & Telemetry Routes
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const {
  getEvent,
  listTickets,
  findTicketByEmail,
  findTicketById,
  createTicket,
  updateTicketById,
  resetTickets
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
  for (let i = 0; i < 4; i++) {
    part1 += TICKET_ALPHABET[bytes[i] % TICKET_ALPHABET.length];
  }
  for (let i = 4; i < 8; i++) {
    part2 += TICKET_ALPHABET[bytes[i] % TICKET_ALPHABET.length];
  }
  return `EP-${part1}-${part2}`;
}

function normalizeTicketId(raw) {
  let ticketId = String(raw || '').trim().toUpperCase();
  if (ticketId.length === 10 && !ticketId.includes('-')) {
    ticketId = `${ticketId.slice(0, 2)}-${ticketId.slice(2, 6)}-${ticketId.slice(6, 10)}`;
  }
  return ticketId;
}

function computeStats(event, tickets) {
  const totalRegistered = tickets.length;
  const insideCount = tickets.filter(t => t.gateCheckedIn).length;
  const mealsCount = tickets.filter(t => t.mealClaimed).length;
  const noShows = totalRegistered - insideCount;
  const seatsRemaining = Math.max(0, event.capacity - totalRegistered);
  const percentage = totalRegistered > 0 ? Math.round((insideCount / totalRegistered) * 100) : 0;

  const dietaryCounts = {
    Veg: tickets.filter(t => t.mealClaimed && t.diet === 'Veg').length,
    'Non-Veg': tickets.filter(t => t.mealClaimed && t.diet === 'Non-Veg').length,
    Jain: tickets.filter(t => t.mealClaimed && t.diet === 'Jain').length,
    Vegan: tickets.filter(t => t.mealClaimed && t.diet === 'Vegan').length
  };

  const recentCheckins = tickets
    .filter(t => t.gateCheckedIn && t.gateCheckedInAt)
    .sort((a, b) => new Date(b.gateCheckedInAt) - new Date(a.gateCheckedInAt))
    .slice(0, 5);

  return {
    stats: {
      totalRegistered,
      insideCount,
      noShows,
      mealsCount,
      seatsRemaining,
      capacity: event.capacity,
      percentage,
      dietaryCounts
    },
    recentCheckins
  };
}

// ----------------------------------------------------
// 1. GET CURRENT EVENT & SEAT CAPACITY (Public)
// ----------------------------------------------------
router.get('/event', async (req, res) => {
  try {
    const event = await getEvent(DEFAULT_EVENT_ID);
    const tickets = await listTickets(event.id);
    const seatsTaken = tickets.length;
    const seatsRemaining = Math.max(0, event.capacity - seatsTaken);

    return res.json({
      success: true,
      event,
      seatsTaken,
      seatsRemaining
    });
  } catch (err) {
    console.error('[Event GET Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to load event details.'
    });
  }
});

// ----------------------------------------------------
// 2. REGISTER ATTENDEE & ISSUE TICKET (Public)
// ----------------------------------------------------
router.post('/tickets/register', async (req, res) => {
  try {
    const { fullName, email, diet } = req.body;
    const trimmedName = String(fullName || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const selectedDiet = ALLOWED_DIETS.includes(diet) ? diet : 'Veg';

    if (trimmedName.length < 2 || trimmedName.length > 60) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid full name (2–60 characters).'
      });
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address.'
      });
    }

    const event = await getEvent(DEFAULT_EVENT_ID);
    const existingTickets = await listTickets(event.id);

    if (existingTickets.length >= event.capacity) {
      return res.status(409).json({
        success: false,
        error: `This event is at full capacity (${event.capacity} of ${event.capacity} seats taken).`
      });
    }

    const existing = await findTicketByEmail(event.id, normalizedEmail);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `This email is already registered. Ticket ID: ${existing.ticketId}`,
        existingTicketId: existing.ticketId
      });
    }

    // Generate unique ticket ID with collision check
    let ticketId = generateTicketId();
    for (let i = 0; i < 5; i++) {
      const collision = await findTicketById(ticketId);
      if (!collision) break;
      ticketId = generateTicketId();
    }

    const ticket = await createTicket({
      ticketId,
      eventId: event.id,
      fullName: trimmedName,
      email: normalizedEmail,
      diet: selectedDiet
    });

    const seatsTaken = existingTickets.length + 1;
    const seatsRemaining = Math.max(0, event.capacity - seatsTaken);

    return res.status(201).json({
      success: true,
      message: `Ticket ${ticket.ticketId} issued for ${ticket.fullName}.`,
      ticket,
      seatsTaken,
      seatsRemaining,
      capacity: event.capacity
    });
  } catch (err) {
    console.error('[Ticket Register Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to register attendee. Please try again.'
    });
  }
});

// ----------------------------------------------------
// 3. VERIFY PASS AT GATE OR MEAL DESK (Volunteer/Organizer)
// ----------------------------------------------------
router.post('/tickets/verify', authenticateToken, requireRole(['volunteer', 'organizer']), async (req, res) => {
  try {
    const mode = req.body.mode === 'meal' ? 'meal' : 'gate';
    const ticketId = normalizeTicketId(req.body.ticketId);

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        resultStatus: 'INVALID_INPUT',
        error: 'Please enter or scan a ticket ID.'
      });
    }

    const ticket = await findTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        resultStatus: 'NOT_FOUND',
        ticketId,
        error: `No ticket "${ticketId}" found.`
      });
    }

    const nowIso = new Date().toISOString();

    if (mode === 'gate') {
      if (ticket.gateCheckedIn) {
        const updated = await updateTicketById(ticket.ticketId, {
          duplicateAttempts: (ticket.duplicateAttempts || 0) + 1
        });
        return res.status(409).json({
          success: false,
          resultStatus: 'DUPLICATE',
          ticket: updated,
          error: 'Duplicate check-in blocked.'
        });
      }

      const updated = await updateTicketById(ticket.ticketId, {
        gateCheckedIn: true,
        gateCheckedInAt: nowIso
      });
      return res.json({
        success: true,
        resultStatus: 'VALID',
        ticket: updated
      });
    }

    // Meal check-in mode
    if (!ticket.gateCheckedIn) {
      return res.status(409).json({
        success: false,
        resultStatus: 'GATE_REQUIRED',
        ticket,
        error: 'Attendee has not checked in at the main gate yet.'
      });
    }

    if (ticket.mealClaimed) {
      return res.status(409).json({
        success: false,
        resultStatus: 'DUPLICATE',
        ticket,
        error: 'Meal already claimed for this pass.'
      });
    }

    const updated = await updateTicketById(ticket.ticketId, {
      mealClaimed: true,
      mealClaimedAt: nowIso
    });
    return res.json({
      success: true,
      resultStatus: 'VALID',
      ticket: updated
    });
  } catch (err) {
    console.error('[Ticket Verify Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify ticket pass.'
    });
  }
});

// ----------------------------------------------------
// 4. LIVE STATS & RECENT CHECK-INS (Volunteer/Organizer)
// ----------------------------------------------------
router.get('/tickets/stats', authenticateToken, requireRole(['volunteer', 'organizer']), async (req, res) => {
  try {
    const event = await getEvent(DEFAULT_EVENT_ID);
    const tickets = await listTickets(event.id);
    const { stats, recentCheckins } = computeStats(event, tickets);

    return res.json({
      success: true,
      event,
      stats,
      recentCheckins
    });
  } catch (err) {
    console.error('[Ticket Stats Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to load live telemetry.'
    });
  }
});

// ----------------------------------------------------
// 5. LIST ALL TICKETS FOR EXPORT (Organizer only)
// ----------------------------------------------------
router.get('/tickets', authenticateToken, requireRole(['organizer']), async (req, res) => {
  try {
    const event = await getEvent(DEFAULT_EVENT_ID);
    const tickets = await listTickets(event.id);

    return res.json({
      success: true,
      event,
      tickets
    });
  } catch (err) {
    console.error('[Ticket List Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to load attendee roster.'
    });
  }
});

// ----------------------------------------------------
// 6. RESET SAMPLE TICKET DATA (Organizer only)
// ----------------------------------------------------
router.post('/tickets/reset', authenticateToken, requireRole(['organizer']), async (req, res) => {
  try {
    const event = await getEvent(DEFAULT_EVENT_ID);
    const tickets = await resetTickets(event.id);

    return res.json({
      success: true,
      message: 'Event data reset to demo state.',
      tickets
    });
  } catch (err) {
    console.error('[Ticket Reset Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to reset sample data.'
    });
  }
});

module.exports = router;
