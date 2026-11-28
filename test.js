/**
 * EventPass - Automated Backend Test Runner
 * Run via: npm test
 */

const authRoutes = require('./authRoutes');
const eventRoutes = require('./eventRoutes');
const { isSupabaseConfigured } = require('./supabaseClient');

function mockReq({ method = 'GET', url = '/', body = {}, headers = {}, query = {}, params = {}, ip = '127.0.0.1' }) {
  return {
    method,
    url,
    body,
    headers,
    query,
    params,
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
  console.log('🧪 Running EventPass Backend Test Suite');
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
  const meHandler = getHandler(authRoutes, 'GET', '/me');

  const eventsHandler = getHandler(eventRoutes, 'GET', '/events');
  const eventCreateHandler = getHandler(eventRoutes, 'POST', '/events');
  const eventStatusHandler = getHandler(eventRoutes, 'POST', '/events/:eventId/status');
  const eventQrHandler = getHandler(eventRoutes, 'POST', '/events/:eventId/qr');
  const ticketRegisterHandler = getHandler(eventRoutes, 'POST', '/tickets/register');
  const ticketCheckinHandler = getHandler(eventRoutes, 'POST', '/tickets/checkin');
  const notifListHandler = getHandler(eventRoutes, 'GET', '/notifications');
  const notifReadHandler = getHandler(eventRoutes, 'POST', '/notifications/read');
  const chatGetHandler = getHandler(eventRoutes, 'GET', '/chat');
  const chatPostHandler = getHandler(eventRoutes, 'POST', '/chat');

  let organizerToken = '';
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

  const newEmail = `attendee_${Date.now()}@eventpass.edu`;
  await test('Sign Up New Attendee Account (No PIN)', async () => {
    const req = mockReq({
      method: 'POST',
      body: {
        email: newEmail,
        password: 'Password123!',
        fullName: 'Test Attendee',
        role: 'attendee'
      }
    });
    const res = mockRes();
    await registerHandler(req, res);
    if (res.statusCode !== 201 || !res.body.success || res.body.user.role !== 'attendee') throw new Error('Registration failed');
    attendeeToken = res.body.token;
  });

  await test('Block Duplicate Email Registration', async () => {
    const req = mockReq({
      method: 'POST',
      body: {
        email: newEmail,
        password: 'Password123!',
        fullName: 'Duplicate User',
        role: 'attendee'
      }
    });
    const res = mockRes();
    await registerHandler(req, res);
    if (res.statusCode !== 409 || res.body.success) throw new Error('Expected 409 Conflict');
  });

  await test('Verify Authenticated Session (/api/auth/me)', async () => {
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

  await test('GET /api/events returns active and passive events', async () => {
    const req = mockReq({
      method: 'GET',
      headers: { authorization: `Bearer ${attendeeToken}` }
    });
    const res = mockRes();
    await eventsHandler(req, res);
    if (res.statusCode !== 200 || !res.body.success || !Array.isArray(res.body.events) || res.body.events.length < 2) {
      throw new Error('Events list failed');
    }
  });

  await test('POST /api/events creates and toggles event for organizer only', async () => {
    const reqAtt = mockReq({
      method: 'POST',
      headers: { authorization: `Bearer ${attendeeToken}` },
      body: { name: 'Blocked Event', venue: 'Hall', date: 'Dec 25, 2026', capacity: 50 }
    });
    const resAtt = mockRes();
    await eventCreateHandler(reqAtt, resAtt);
    if (resAtt.statusCode !== 403) throw new Error('Expected 403 for attendee');

    const reqOrg = mockReq({
      method: 'POST',
      headers: { authorization: `Bearer ${organizerToken}` },
      body: { name: 'AI Agents Workshop', venue: 'Auditorium A', date: 'Dec 25, 2026', capacity: 120 }
    });
    const resOrg = mockRes();
    await eventCreateHandler(reqOrg, resOrg);
    if (resOrg.statusCode !== 201 || !resOrg.body.event || resOrg.body.event.status !== 'active') {
      throw new Error('Expected 201 created active event');
    }

    const reqStatus = mockReq({
      method: 'POST',
      params: { eventId: resOrg.body.event.id },
      headers: { authorization: `Bearer ${organizerToken}` },
      body: { status: 'passive' }
    });
    const resStatus = mockRes();
    await eventStatusHandler(reqStatus, resStatus);
    if (resStatus.statusCode !== 200 || resStatus.body.event.status !== 'passive') {
      throw new Error('Expected passive status update');
    }
  });

  let qrPayload = '';
  await test('POST /api/events/E01/qr generates scannable QR for organizer only', async () => {
    const reqAtt = mockReq({
      method: 'POST',
      params: { eventId: 'E01' },
      headers: { authorization: `Bearer ${attendeeToken}` }
    });
    const resAtt = mockRes();
    await eventQrHandler(reqAtt, resAtt);
    if (resAtt.statusCode !== 403) throw new Error('Expected 403 for attendee');

    const reqOrg = mockReq({
      method: 'POST',
      params: { eventId: 'E01' },
      headers: { authorization: `Bearer ${organizerToken}` }
    });
    const resOrg = mockRes();
    await eventQrHandler(reqOrg, resOrg);
    if (resOrg.statusCode !== 200 || !resOrg.body.qrPayload) throw new Error('Expected QR payload');
    qrPayload = resOrg.body.qrPayload;
  });

  await test('POST /api/tickets/register issues pass and blocks duplicate', async () => {
    const req1 = mockReq({
      method: 'POST',
      body: { eventId: 'E02', fullName: 'Test Attendee', email: newEmail }
    });
    const res1 = mockRes();
    await ticketRegisterHandler(req1, res1);
    if (res1.statusCode !== 201 || !res1.body.ticket.ticketId.startsWith('EP-')) {
      throw new Error('Ticket registration failed');
    }

    const req2 = mockReq({
      method: 'POST',
      body: { eventId: 'E02', fullName: 'Test Attendee', email: newEmail }
    });
    const res2 = mockRes();
    await ticketRegisterHandler(req2, res2);
    if (res2.statusCode !== 409) throw new Error('Expected 409 duplicate registration');
  });

  await test('POST /api/tickets/checkin verifies Organizer QR and blocks duplicate', async () => {
    const req1 = mockReq({
      method: 'POST',
      headers: { authorization: `Bearer ${attendeeToken}` },
      body: { rawPayload: qrPayload }
    });
    const res1 = mockRes();
    await ticketCheckinHandler(req1, res1);
    if (res1.statusCode !== 200 || res1.body.resultStatus !== 'VALID' || !res1.body.ticket.gateCheckedIn) {
      throw new Error('QR check-in failed');
    }

    const req2 = mockReq({
      method: 'POST',
      headers: { authorization: `Bearer ${attendeeToken}` },
      body: { rawPayload: qrPayload }
    });
    const res2 = mockRes();
    await ticketCheckinHandler(req2, res2);
    if (res2.statusCode !== 409 || res2.body.resultStatus !== 'DUPLICATE') {
      throw new Error('Expected DUPLICATE check-in block');
    }
  });

  await test('Notifications & Chat endpoints persist and return data', async () => {
    const resNotif = mockRes();
    await notifListHandler(mockReq({ headers: { authorization: `Bearer ${attendeeToken}` } }), resNotif);
    if (resNotif.statusCode !== 200 || !Array.isArray(resNotif.body.notifications)) {
      throw new Error('Notifications GET failed');
    }

    const resRead = mockRes();
    await notifReadHandler(mockReq({ method: 'POST', headers: { authorization: `Bearer ${attendeeToken}` } }), resRead);
    if (resRead.statusCode !== 200) throw new Error('Notifications mark read failed');

    const resChatPost = mockRes();
    await chatPostHandler(
      mockReq({ method: 'POST', headers: { authorization: `Bearer ${attendeeToken}` }, body: { message: 'Hello Desk!' } }),
      resChatPost
    );
    if (resChatPost.statusCode !== 201 || resChatPost.body.message.message !== 'Hello Desk!') {
      throw new Error('Chat POST failed');
    }

    const resChatGet = mockRes();
    await chatGetHandler(mockReq({ headers: { authorization: `Bearer ${attendeeToken}` } }), resChatGet);
    if (resChatGet.statusCode !== 200 || !Array.isArray(resChatGet.body.messages)) {
      throw new Error('Chat GET failed');
    }
  });

  console.log('========================================================');
  console.log(`Summary: ${passed}/${total} tests passed.`);
  console.log('========================================================');

  process.exit(passed === total ? 0 : 1);
}

run();
