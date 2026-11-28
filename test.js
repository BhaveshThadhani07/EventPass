/**
 * EventPass - Automated Backend Test Runner
 * Run via: npm test
 */

const authRoutes = require('./authRoutes');
const eventRoutes = require('./eventRoutes');
const { isSupabaseConfigured } = require('./supabaseClient');

function mockReq({ method = 'GET', url = '/', body = {}, headers = {}, query = {}, ip = '127.0.0.1' }) {
  return {
    method,
    url,
    body,
    headers,
    query,
    ip,
    get: (h) => headers[h.toLowerCase()] || headers[h]
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; }
  };
}

function getHandler(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
      const handles = layer.route.stack.map(s => s.handle);
      return async (req, res) => {
        for (const handle of handles) {
          let nextCalled = false;
          await new Promise((resolve) => {
            const next = () => { nextCalled = true; resolve(); };
            const p = handle(req, res, next);
            if (p && typeof p.then === 'function') {
              p.then(() => { if (!nextCalled) resolve(); });
            } else if (res.body !== null || !nextCalled) {
              resolve();
            }
          });
          if (res.body !== null) break;
        }
      };
    }
  }
  return null;
}

async function run() {
  console.log('========================================================');
  console.log('🧪 Running EventPass Authentication Test Suite');
  console.log('📡 Database Mode:', isSupabaseConfigured() ? 'Supabase Connected' : 'Local Storage Fallback Mode');
  console.log('========================================================');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
    }
  }

  const loginHandler = getHandler(authRoutes, 'POST', '/login');
  const registerHandler = getHandler(authRoutes, 'POST', '/register');
  const pinHandler = getHandler(authRoutes, 'POST', '/pin-login');
  const meHandler = getHandler(authRoutes, 'GET', '/me');

  const eventHandler = getHandler(eventRoutes, 'GET', '/event');
  const ticketRegisterHandler = getHandler(eventRoutes, 'POST', '/tickets/register');
  const ticketVerifyHandler = getHandler(eventRoutes, 'POST', '/tickets/verify');
  const ticketStatsHandler = getHandler(eventRoutes, 'GET', '/tickets/stats');
  const ticketListHandler = getHandler(eventRoutes, 'GET', '/tickets');

  let organizerToken = '';
  let volunteerToken = '';
  let attendeeToken = '';

  await test('Organizer Login (bhavesh@eventpass.edu / admin123)', async () => {
    const req = mockReq({ method: 'POST', body: { email: 'bhavesh@eventpass.edu', password: 'admin123' } });
    const res = mockRes();
    await loginHandler(req, res);
    if (res.statusCode !== 200 || !res.body.success || !res.body.token) throw new Error('Login failed');
    organizerToken = res.body.token;
  });

  await test('Reject Login with Invalid Password', async () => {
    const req = mockReq({ method: 'POST', body: { email: 'bhavesh@eventpass.edu', password: 'badpassword' } });
    const res = mockRes();
    await loginHandler(req, res);
    if (res.statusCode !== 401 || res.body.success) throw new Error('Expected 401 Unauthorized');
  });

  const newEmail = `user_${Date.now()}@eventpass.edu`;
  await test('Sign Up New Account with Role & PIN', async () => {
    const req = mockReq({
      method: 'POST',
      body: {
        email: newEmail,
        password: 'Password123!',
        fullName: 'Test Desk Volunteer',
        role: 'volunteer',
        pinCode: '4321'
      }
    });
    const res = mockRes();
    await registerHandler(req, res);
    if (res.statusCode !== 201 || !res.body.success || res.body.user.role !== 'volunteer') throw new Error('Registration failed');
  });

  await test('Block Duplicate Email Registration', async () => {
    const req = mockReq({
      method: 'POST',
      body: {
        email: newEmail,
        password: 'Password123!',
        fullName: 'Duplicate User',
        role: 'volunteer'
      }
    });
    const res = mockRes();
    await registerHandler(req, res);
    if (res.statusCode !== 409 || res.body.success) throw new Error('Expected 409 Conflict');
  });

  await test('Verify Authenticated Session (/api/auth/me) with Bearer Token', async () => {
    const req = mockReq({
      method: 'GET',
      headers: { authorization: `Bearer ${organizerToken}` }
    });
    const res = mockRes();
    await meHandler(req, res);
    if (res.statusCode !== 200 || !res.body.success || res.body.user.email !== 'bhavesh@eventpass.edu') {
      throw new Error('Token verification failed');
    }
  });

  await test('Quick PIN Login for Entrance Check-in Desk', async () => {
    const req = mockReq({ method: 'POST', body: { role: 'volunteer', pin: '1234' } });
    const res = mockRes();
    await pinHandler(req, res);
    if (res.statusCode !== 200 || !res.body.success || res.body.user.role !== 'volunteer') throw new Error('PIN login failed');
    volunteerToken = res.body.token;
  });

  await test('Attendee Login for RBAC negative test', async () => {
    const req = mockReq({ method: 'POST', body: { email: 'ananya@eventpass.edu', password: 'attendee123' } });
    const res = mockRes();
    await loginHandler(req, res);
    if (res.statusCode !== 200 || !res.body.token) throw new Error('Attendee login failed');
    attendeeToken = res.body.token;
  });

  await test('GET /api/event returns event details and seat capacity', async () => {
    const req = mockReq({ method: 'GET' });
    const res = mockRes();
    await eventHandler(req, res);
    if (res.statusCode !== 200 || !res.body.success || !res.body.event || typeof res.body.seatsRemaining !== 'number') {
      throw new Error('Event endpoint failed');
    }
  });

  const ticketEmail = `attendee_${Date.now()}@example.com`;
  let issuedTicketId = '';

  await test('POST /api/tickets/register issues unique EP-XXXX-XXXX pass', async () => {
    const req = mockReq({
      method: 'POST',
      body: { fullName: 'Meera Deshmukh', email: ticketEmail, diet: 'Jain' }
    });
    const res = mockRes();
    await ticketRegisterHandler(req, res);
    if (res.statusCode !== 201 || !res.body.success || !res.body.ticket.ticketId.startsWith('EP-')) {
      throw new Error('Ticket registration failed');
    }
    issuedTicketId = res.body.ticket.ticketId;
  });

  await test('POST /api/tickets/register blocks duplicate email', async () => {
    const req = mockReq({
      method: 'POST',
      body: { fullName: 'Meera Duplicate', email: ticketEmail, diet: 'Veg' }
    });
    const res = mockRes();
    await ticketRegisterHandler(req, res);
    if (res.statusCode !== 409 || res.body.success) throw new Error('Expected 409 duplicate ticket');
  });

  await test('POST /api/tickets/verify blocks unauthenticated and attendee roles', async () => {
    const reqUnauth = mockReq({ method: 'POST', body: { ticketId: issuedTicketId, mode: 'gate' } });
    const resUnauth = mockRes();
    await ticketVerifyHandler(reqUnauth, resUnauth);
    if (resUnauth.statusCode !== 401) throw new Error('Expected 401 unauthenticated');

    const reqAttendee = mockReq({
      method: 'POST',
      headers: { authorization: `Bearer ${attendeeToken}` },
      body: { ticketId: issuedTicketId, mode: 'gate' }
    });
    const resAttendee = mockRes();
    await ticketVerifyHandler(reqAttendee, resAttendee);
    if (resAttendee.statusCode !== 403) throw new Error('Expected 403 forbidden for attendee');
  });

  await test('POST /api/tickets/verify blocks meal before gate entry', async () => {
    const req = mockReq({
      method: 'POST',
      headers: { authorization: `Bearer ${volunteerToken}` },
      body: { ticketId: issuedTicketId, mode: 'meal' }
    });
    const res = mockRes();
    await ticketVerifyHandler(req, res);
    if (res.statusCode !== 409 || res.body.resultStatus !== 'GATE_REQUIRED') {
      throw new Error('Expected GATE_REQUIRED');
    }
  });

  await test('POST /api/tickets/verify admits at gate and blocks duplicate gate scan', async () => {
    const req1 = mockReq({
      method: 'POST',
      headers: { authorization: `Bearer ${volunteerToken}` },
      body: { ticketId: issuedTicketId.replace(/-/g, ''), mode: 'gate' }
    });
    const res1 = mockRes();
    await ticketVerifyHandler(req1, res1);
    if (res1.statusCode !== 200 || res1.body.resultStatus !== 'VALID' || !res1.body.ticket.gateCheckedIn) {
      throw new Error('Expected VALID gate check-in');
    }

    const req2 = mockReq({
      method: 'POST',
      headers: { authorization: `Bearer ${volunteerToken}` },
      body: { ticketId: issuedTicketId, mode: 'gate' }
    });
    const res2 = mockRes();
    await ticketVerifyHandler(req2, res2);
    if (res2.statusCode !== 409 || res2.body.resultStatus !== 'DUPLICATE' || res2.body.ticket.duplicateAttempts !== 1) {
      throw new Error('Expected DUPLICATE gate scan block');
    }
  });

  await test('POST /api/tickets/verify serves meal and blocks duplicate meal', async () => {
    const req1 = mockReq({
      method: 'POST',
      headers: { authorization: `Bearer ${volunteerToken}` },
      body: { ticketId: issuedTicketId, mode: 'meal' }
    });
    const res1 = mockRes();
    await ticketVerifyHandler(req1, res1);
    if (res1.statusCode !== 200 || res1.body.resultStatus !== 'VALID' || !res1.body.ticket.mealClaimed) {
      throw new Error('Expected VALID meal check-in');
    }

    const req2 = mockReq({
      method: 'POST',
      headers: { authorization: `Bearer ${volunteerToken}` },
      body: { ticketId: issuedTicketId, mode: 'meal' }
    });
    const res2 = mockRes();
    await ticketVerifyHandler(req2, res2);
    if (res2.statusCode !== 409 || res2.body.resultStatus !== 'DUPLICATE') {
      throw new Error('Expected DUPLICATE meal block');
    }
  });

  await test('GET /api/tickets/stats and /api/tickets enforce roles and return telemetry', async () => {
    const reqStats = mockReq({
      method: 'GET',
      headers: { authorization: `Bearer ${volunteerToken}` }
    });
    const resStats = mockRes();
    await ticketStatsHandler(reqStats, resStats);
    if (resStats.statusCode !== 200 || !resStats.body.success || resStats.body.stats.insideCount < 1) {
      throw new Error('Expected telemetry stats');
    }

    const reqVolList = mockReq({
      method: 'GET',
      headers: { authorization: `Bearer ${volunteerToken}` }
    });
    const resVolList = mockRes();
    await ticketListHandler(reqVolList, resVolList);
    if (resVolList.statusCode !== 403) throw new Error('Expected 403 for volunteer listing full roster');

    const reqOrgList = mockReq({
      method: 'GET',
      headers: { authorization: `Bearer ${organizerToken}` }
    });
    const resOrgList = mockRes();
    await ticketListHandler(reqOrgList, resOrgList);
    if (resOrgList.statusCode !== 200 || !Array.isArray(resOrgList.body.tickets)) {
      throw new Error('Expected organizer ticket list');
    }
  });

  console.log('========================================================');
  console.log(`Summary: ${passed}/${total} tests passed.`);
  console.log('========================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run();
