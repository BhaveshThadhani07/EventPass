/**
 * EventPass - Automated Authentication Test Runner
 * Run via: npm test
 */

const authRoutes = require('./authRoutes');
const { isSupabaseConfigured } = require('./supabaseClient');

function mockReq({ method = 'GET', url = '/', body = {}, headers = {}, ip = '127.0.0.1' }) {
  return {
    method,
    url,
    body,
    headers,
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

  let organizerToken = '';

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
