/**
 * EventPass - Main Client Application Logic
 * Integrates:
 * - End-to-end Authentication (Email/Password, Roles, Desk PIN)
 * - IndexedDB Client Persistence for Tickets & Check-ins
 * - Real-time Crowd & Catering Telemetry
 * - Responsive UI synchronization across desktop, tablet, and mobile
 * - CSV Export
 */

let db;
const MAX_SEATS = 50;
const CURRENT_EVENT = {
  id: 'E01',
  name: 'Intro to Web Dev Workshop',
  date: '2026-11-14',
  venue: 'Seminar Hall B',
  capacity: MAX_SEATS
};

// ----------------------------------------------------
// 1. IndexedDB Initialization
// ----------------------------------------------------
const req = indexedDB.open('EventpassDB', 2);

req.onupgradeneeded = (e) => {
  db = e.target.result;
  if (!db.objectStoreNames.contains('tickets')) {
    const store = db.createObjectStore('tickets', { keyPath: 'ticketId' });
    store.createIndex('email', 'email', { unique: true });
    store.createIndex('gateCheckedIn', 'gateCheckedIn', { unique: false });
    store.createIndex('mealClaimed', 'mealClaimed', { unique: false });
  }
};

req.onsuccess = (e) => {
  db = e.target.result;
  seedInitialAttendeesIfEmpty();
  updateAdmin();
  checkBackendStatus();
};

req.onerror = (e) => {
  console.error('[IndexedDB] Database failed to open:', e.target.error);
  showToast('Database storage restricted in this browser session.', 'error');
};

// ----------------------------------------------------
// 2. Navigation & Role-Based Screen Guarding
// ----------------------------------------------------
function openTile(name) {
  // Sync desktop navigation tabs
  document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
  const deskNav = document.getElementById(`desk-nav-${name}`);
  if (deskNav) deskNav.classList.add('active');

  // Sync mobile bottom navigation tabs
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
  const mobNav = document.getElementById(`nav-btn-${name}`);
  if (mobNav) mobNav.classList.add('active');

  // Hide all views
  document.querySelectorAll('.tile-view').forEach(t => t.classList.add('hidden'));

  // Show target view
  const targetTile = document.getElementById(`tile-${name}`);
  if (targetTile) {
    targetTile.classList.remove('hidden');
  }

  // Check role locks
  checkTilePermissions();

  if (name === 'admin' || name === 'scan') {
    updateAdmin();
  }
}

function checkTilePermissions() {
  const isVol = Auth.isVolunteer(); // Organizer or Volunteer
  const isOrg = Auth.isOrganizer(); // Organizer only

  // Scan Desk role guard
  const scanLock = document.getElementById('scan-role-lock');
  const scanContent = document.getElementById('scan-content-panel');
  if (scanLock && scanContent) {
    if (isVol) {
      scanLock.classList.add('hidden');
      scanContent.classList.remove('hidden');
    } else {
      scanLock.classList.remove('hidden');
      scanContent.classList.add('hidden');
    }
  }

  // Admin Telemetry role guard
  const adminLock = document.getElementById('admin-role-lock');
  const adminContent = document.getElementById('admin-content-panel');
  if (adminLock && adminContent) {
    if (isOrg) {
      adminLock.classList.add('hidden');
      adminContent.classList.remove('hidden');
    } else {
      adminLock.classList.remove('hidden');
      adminContent.classList.add('hidden');
    }
  }
}

window.checkTilePermissions = checkTilePermissions;

// ----------------------------------------------------
// 3. Ticket Generation (Compliant with PRD Section 7)
// ----------------------------------------------------
// Base31 alphabet: ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no 0, O, 1, I, L)
const TICKET_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateTicketId() {
  const bytes = new Uint8Array(8);
  window.crypto.getRandomValues(bytes);
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

// ----------------------------------------------------
// 4. Attendee Registration (Tile 1)
// ----------------------------------------------------
async function registerUser() {
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const dietInput = document.getElementById('diet');
  const msgEl = document.getElementById('reg-msg');
  const resultCard = document.getElementById('ticket-result-card');
  const infoPlaceholder = document.getElementById('ticket-info-placeholder');

  const fullName = nameInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const diet = dietInput.value;

  msgEl.textContent = '';
  msgEl.className = 'feedback-msg';

  // Client validation
  if (!fullName || fullName.length < 2 || fullName.length > 60) {
    msgEl.textContent = 'Please enter a valid full name (2–60 characters).';
    msgEl.classList.add('text-danger');
    nameInput.focus();
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    msgEl.textContent = 'Please enter a valid email address.';
    msgEl.classList.add('text-danger');
    emailInput.focus();
    return;
  }

  if (!db) {
    showToast('Database initializing, please try again.', 'warning');
    return;
  }

  // Check capacity & existing registration
  const tx = db.transaction(['tickets'], 'readwrite');
  const store = tx.objectStore('tickets');

  const countReq = store.count();
  countReq.onsuccess = () => {
    const totalCount = countReq.result;
    if (totalCount >= MAX_SEATS) {
      msgEl.textContent = `This event is at full capacity (${MAX_SEATS} of ${MAX_SEATS} seats taken).`;
      msgEl.classList.add('text-danger');
      return;
    }

    const emailIndex = store.index('email');
    const existingReq = emailIndex.get(email);

    existingReq.onsuccess = () => {
      if (existingReq.result) {
        const existing = existingReq.result;
        msgEl.textContent = `This email is already registered. Ticket ID: ${existing.ticketId}`;
        msgEl.classList.add('text-warning');
        showToast('Email address already registered.', 'warning');
        return;
      }

      // Generate unique ticket
      const ticketId = generateTicketId();
      const newTicket = {
        ticketId,
        eventId: CURRENT_EVENT.id,
        fullName,
        email,
        diet,
        registeredAt: new Date().toISOString(),
        gateCheckedIn: false,
        gateCheckedInAt: null,
        mealClaimed: false,
        mealClaimedAt: null,
        duplicateAttempts: 0
      };

      store.add(newTicket);

      tx.oncomplete = () => {
        // Display Ticket Card
        document.getElementById('pass-ticket-id').textContent = ticketId;
        document.getElementById('pass-holder-name').textContent = fullName;
        document.getElementById('pass-holder-diet').textContent = diet;
        
        if (infoPlaceholder) infoPlaceholder.classList.add('hidden');
        resultCard.classList.remove('hidden');

        msgEl.textContent = `Ticket ${ticketId} issued for ${fullName}.`;
        msgEl.classList.add('text-success');

        showToast(`Pass issued for ${fullName}.`, 'success');
        updateAdmin();
      };
    };
  };
}

function resetRegisterForm() {
  document.getElementById('name').value = '';
  document.getElementById('email').value = '';
  document.getElementById('ticket-result-card').classList.add('hidden');
  
  const infoPlaceholder = document.getElementById('ticket-info-placeholder');
  if (infoPlaceholder) infoPlaceholder.classList.remove('hidden');

  document.getElementById('reg-msg').textContent = '';
  document.getElementById('name').focus();
}

// ----------------------------------------------------
// 5. Gate & Meal Scan Desk (Tile 2)
// ----------------------------------------------------
function verifyPass() {
  const scanType = document.getElementById('scan-type').value;
  const inputEl = document.getElementById('ticket-input');
  const msgEl = document.getElementById('scan-msg');
  const resultPanel = document.getElementById('scan-result-panel');
  const resultBadge = document.getElementById('scan-result-badge');
  const resultTime = document.getElementById('scan-result-time');
  const resultTitle = document.getElementById('scan-result-title');
  const resultDesc = document.getElementById('scan-result-desc');
  const resultMeta = document.getElementById('scan-result-meta');

  let ticketId = inputEl.value.trim().toUpperCase();

  // Tolerate missing hyphen (e.g. EP7K3QX9M2 -> EP-7K3Q-X9M2)
  if (ticketId.length === 10 && !ticketId.includes('-')) {
    ticketId = `${ticketId.slice(0, 2)}-${ticketId.slice(2, 6)}-${ticketId.slice(6, 10)}`;
  }

  if (!ticketId) {
    showToast('Please enter or scan a ticket ID.', 'warning');
    inputEl.focus();
    return;
  }

  resultPanel.className = 'result-panel hidden';
  msgEl.textContent = '';

  const tx = db.transaction(['tickets'], 'readwrite');
  const store = tx.objectStore('tickets');
  const getReq = store.get(ticketId);

  getReq.onsuccess = () => {
    const ticket = getReq.result;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (!ticket) {
      resultPanel.className = 'result-panel result-error';
      resultBadge.textContent = 'NOT FOUND';
      resultTime.textContent = nowTime;
      resultTitle.textContent = `No ticket "${ticketId}" found`;
      resultDesc.textContent = 'Verify the alphanumeric ID or direct attendee to the Help Desk.';
      resultMeta.textContent = 'Unrecognized ticket identifier.';
      resultPanel.classList.remove('hidden');
      showToast('Ticket not found in roster.', 'error');
      return;
    }

    // Scenario A: Gate Entry
    if (scanType === 'gate') {
      if (ticket.gateCheckedIn) {
        // DUPLICATE ATTEMPT
        ticket.duplicateAttempts = (ticket.duplicateAttempts || 0) + 1;
        store.put(ticket);

        resultPanel.className = 'result-panel result-duplicate';
        resultBadge.textContent = 'ALREADY CHECKED IN';
        resultTime.textContent = ticket.gateCheckedInAt;
        resultTitle.textContent = 'Duplicate Check-in Blocked';
        resultDesc.textContent = `Already admitted at ${ticket.gateCheckedInAt}. Not counted again.`;
        resultMeta.textContent = `Attendee: ${ticket.fullName} (${ticket.email}) • Duplicate attempts: ${ticket.duplicateAttempts}`;
        resultPanel.classList.remove('hidden');
        showToast('Duplicate check-in blocked.', 'warning');
      } else {
        // VALID GATE CHECK-IN
        ticket.gateCheckedIn = true;
        ticket.gateCheckedInAt = nowTime;
        store.put(ticket);

        resultPanel.className = 'result-panel result-valid';
        resultBadge.textContent = 'CHECKED IN';
        resultTime.textContent = nowTime;
        resultTitle.textContent = `Welcome, ${ticket.fullName}`;
        resultDesc.textContent = `Checked in at ${nowTime}. Pass valid.`;
        resultMeta.textContent = `Dietary: ${ticket.diet} • Email: ${ticket.email}`;
        resultPanel.classList.remove('hidden');

        inputEl.value = '';
        inputEl.focus();
        showToast(`Admitted: ${ticket.fullName}`, 'success');
      }
    } 
    // Scenario B: Dining / Meal Check
    else if (scanType === 'meal') {
      if (!ticket.gateCheckedIn) {
        resultPanel.className = 'result-panel result-error';
        resultBadge.textContent = 'GATE ENTRY REQUIRED';
        resultTime.textContent = nowTime;
        resultTitle.textContent = 'Attendee Not Admitted at Gate';
        resultDesc.textContent = `${ticket.fullName} has not checked in through the main gate yet.`;
        resultMeta.textContent = 'Direct attendee to main entrance registration desk first.';
        resultPanel.classList.remove('hidden');
        showToast('Main gate check-in required first.', 'warning');
      } else if (ticket.mealClaimed) {
        resultPanel.className = 'result-panel result-duplicate';
        resultBadge.textContent = 'MEAL ALREADY CLAIMED';
        resultTime.textContent = ticket.mealClaimedAt;
        resultTitle.textContent = 'Duplicate Meal Attempt';
        resultDesc.textContent = `Meal plate was previously issued at ${ticket.mealClaimedAt}.`;
        resultMeta.textContent = `Dietary: ${ticket.diet} • Name: ${ticket.fullName}`;
        resultPanel.classList.remove('hidden');
        showToast('Meal already claimed for this pass.', 'warning');
      } else {
        ticket.mealClaimed = true;
        ticket.mealClaimedAt = nowTime;
        store.put(ticket);

        resultPanel.className = 'result-panel result-valid';
        resultBadge.textContent = 'VALID MEAL PASS';
        resultTime.textContent = nowTime;
        resultTitle.textContent = `Serve Plate: ${ticket.diet.toUpperCase()}`;
        resultDesc.textContent = `Meal pass validated for ${ticket.fullName} at ${nowTime}.`;
        resultMeta.textContent = `Issue ${ticket.diet} meal plate.`;
        resultPanel.classList.remove('hidden');

        inputEl.value = '';
        inputEl.focus();
        showToast(`Issued ${ticket.diet} meal plate to ${ticket.fullName}`, 'success');
      }
    }

    tx.oncomplete = () => {
      updateAdmin();
    };
  };
}

// ----------------------------------------------------
// 6. Admin Telemetry & Live Stats (Tile 3)
// ----------------------------------------------------
function updateAdmin() {
  if (!db) return;

  const tx = db.transaction(['tickets'], 'readonly');
  const store = tx.objectStore('tickets');
  const allReq = store.getAll();

  allReq.onsuccess = () => {
    const list = allReq.result || [];
    const totalRegistered = list.length;
    const insideCount = list.filter(t => t.gateCheckedIn).length;
    const mealsCount = list.filter(t => t.mealClaimed).length;
    const noShows = totalRegistered - insideCount;
    const seatsRemaining = MAX_SEATS - totalRegistered;
    const percentage = totalRegistered > 0 ? Math.round((insideCount / totalRegistered) * 100) : 0;

    // Update Seat Capacity Pill
    const seatsEl = document.getElementById('seats-text');
    if (seatsEl) {
      seatsEl.textContent = `Seats Left: ${seatsRemaining} / ${MAX_SEATS}`;
    }

    // Update Check-in Desk Counter & Progress
    const deskInside = document.getElementById('desk-counter-inside');
    const deskTotal = document.getElementById('desk-counter-total');
    const deskProgress = document.getElementById('desk-progress-fill');
    if (deskInside) deskInside.textContent = insideCount;
    if (deskTotal) deskTotal.textContent = `/ ${totalRegistered} Inside (${percentage}%)`;
    if (deskProgress) deskProgress.style.width = `${percentage}%`;

    // Update Admin Stats
    const insideEl = document.getElementById('stat-inside');
    const regEl = document.getElementById('stat-registered');
    const noshowEl = document.getElementById('stat-noshows');
    const mealEl = document.getElementById('stat-meals');

    if (insideEl) insideEl.textContent = insideCount;
    if (regEl) regEl.textContent = totalRegistered;
    if (noshowEl) noshowEl.textContent = noShows;
    if (mealEl) mealEl.textContent = mealsCount;

    // Diet Breakdown of served meals
    const vegCount = list.filter(t => t.mealClaimed && t.diet === 'Veg').length;
    const nonvegCount = list.filter(t => t.mealClaimed && t.diet === 'Non-Veg').length;
    const jainCount = list.filter(t => t.mealClaimed && t.diet === 'Jain').length;
    const veganCount = list.filter(t => t.mealClaimed && t.diet === 'Vegan').length;

    if (document.getElementById('count-veg')) document.getElementById('count-veg').textContent = vegCount;
    if (document.getElementById('count-nonveg')) document.getElementById('count-nonveg').textContent = nonvegCount;
    if (document.getElementById('count-jain')) document.getElementById('count-jain').textContent = jainCount;
    if (document.getElementById('count-vegan')) document.getElementById('count-vegan').textContent = veganCount;

    // Update Recent Check-ins List (Last 5 Desk entries)
    renderRecentCheckins(list);
  };
}

function renderRecentCheckins(list) {
  const container = document.getElementById('recent-checkins-list');
  if (!container) return;

  const checkedInList = list
    .filter(t => t.gateCheckedIn && t.gateCheckedInAt)
    .slice(-5)
    .reverse();

  if (checkedInList.length === 0) {
    container.innerHTML = `<div class="feed-item"><span class="text-muted">No check-ins recorded yet.</span></div>`;
    return;
  }

  container.innerHTML = checkedInList.map(t => `
    <div class="feed-item">
      <div class="feed-item-left">
        <span class="feed-name">${escapeHtml(t.fullName)}</span>
        <span class="feed-ticket">${escapeHtml(t.ticketId)}</span>
      </div>
      <div class="feed-item-right">
        <span class="role-badge role-organizer">CHECKED IN</span>
        <span class="feed-time">${escapeHtml(t.gateCheckedInAt)}</span>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

// CSV Export (PRD Section 7 compliant)
function exportAttendeesCSV() {
  if (!db) return;

  const tx = db.transaction(['tickets'], 'readonly');
  const store = tx.objectStore('tickets');
  const allReq = store.getAll();

  allReq.onsuccess = () => {
    const attendees = allReq.result || [];
    if (attendees.length === 0) {
      showToast('No attendee records to export.', 'warning');
      return;
    }

    // Header row
    const headers = ['Ticket ID', 'Full Name', 'Email', 'Diet Preference', 'Gate Admitted', 'Admitted At', 'Meal Claimed', 'Meal Claimed At'];
    
    // Rows with formula injection prevention
    const rows = attendees.map(a => {
      let name = (a.fullName || '').replace(/"/g, '""');
      let email = (a.email || '').replace(/"/g, '""');
      if (name.startsWith('=') || name.startsWith('+') || name.startsWith('-') || name.startsWith('@')) name = `'` + name;
      if (email.startsWith('=') || email.startsWith('+') || email.startsWith('-') || email.startsWith('@')) email = `'` + email;

      return [
        `"${a.ticketId}"`,
        `"${name}"`,
        `"${email}"`,
        `"${a.diet || ''}"`,
        `"${a.gateCheckedIn ? 'YES' : 'NO'}"`,
        `"${a.gateCheckedInAt || '—'}"`,
        `"${a.mealClaimed ? 'YES' : 'NO'}"`,
        `"${a.mealClaimedAt || '—'}"`
      ];
    });

    // UTF-8 BOM prefix for Microsoft Excel compatibility
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `eventpass-attendees-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Attendee roster exported to CSV.', 'success');
  };
}

// Sample Data Seeder
function seedInitialAttendeesIfEmpty() {
  const tx = db.transaction(['tickets'], 'readwrite');
  const store = tx.objectStore('tickets');
  const countReq = store.count();

  countReq.onsuccess = () => {
    if (countReq.result === 0) {
      const samples = [
        {
          ticketId: 'EP-7K3Q-X9M2',
          eventId: CURRENT_EVENT.id,
          fullName: 'Ananya Kulkarni',
          email: 'ananya@eventpass.edu',
          diet: 'Veg',
          registeredAt: new Date(Date.now() - 3600000).toISOString(),
          gateCheckedIn: true,
          gateCheckedInAt: '10:42 AM',
          mealClaimed: true,
          mealClaimedAt: '12:15 PM',
          duplicateAttempts: 0
        },
        {
          ticketId: 'EP-B2XK-9HDR',
          eventId: CURRENT_EVENT.id,
          fullName: 'Sana Sheikh',
          email: 'sana@example.com',
          diet: 'Non-Veg',
          registeredAt: new Date(Date.now() - 3000000).toISOString(),
          gateCheckedIn: true,
          gateCheckedInAt: '10:51 AM',
          mealClaimed: false,
          mealClaimedAt: null,
          duplicateAttempts: 0
        },
        {
          ticketId: 'EP-4M8T-QW3N',
          eventId: CURRENT_EVENT.id,
          fullName: 'Rohan Patil',
          email: 'rohan@example.com',
          diet: 'Jain',
          registeredAt: new Date(Date.now() - 2500000).toISOString(),
          gateCheckedIn: false,
          gateCheckedInAt: null,
          mealClaimed: false,
          mealClaimedAt: null,
          duplicateAttempts: 0
        }
      ];

      samples.forEach(s => store.add(s));
      tx.oncomplete = () => {
        updateAdmin();
      };
    }
  };
}

function resetEventData() {
  if (!confirm('Are you sure you want to reset attendee records back to initial demo state?')) return;
  const tx = db.transaction(['tickets'], 'readwrite');
  const store = tx.objectStore('tickets');
  store.clear();
  tx.oncomplete = () => {
    seedInitialAttendeesIfEmpty();
    showToast('Event data reset to demo state.', 'info');
  };
}

// ----------------------------------------------------
// 7. Authentication UI & Modal Handlers
// ----------------------------------------------------
function openAuthModal(tab = 'signin', defaultRole = null) {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('hidden');

  switchAuthTab(tab);

  if (defaultRole && tab === 'pin') {
    const pinRoleSelect = document.getElementById('pin-role');
    if (pinRoleSelect) pinRoleSelect.value = defaultRole;
  }

  clearAuthFeedback();
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
  clearAuthFeedback();
}

function handleModalBackdropClick(e) {
  if (e.target.id === 'auth-modal') {
    closeAuthModal();
  }
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`tab-btn-${tab}`);
  if (btn) btn.classList.add('active');

  document.querySelectorAll('.auth-view').forEach(v => v.classList.add('hidden'));
  const view = document.getElementById(`auth-view-${tab}`);
  if (view) view.classList.remove('hidden');

  clearAuthFeedback();
}

function togglePasswordVisibility(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function fillDemoCredentials(email, password) {
  switchAuthTab('signin');
  document.getElementById('signin-email').value = email;
  document.getElementById('signin-password').value = password;
  showToast(`Loaded demo credentials: ${email}`, 'info');
}

function toggleUserDropdown() {
  const menu = document.getElementById('user-dropdown-menu');
  if (!menu) return;
  menu.classList.toggle('hidden');

  const user = Auth.getUser();
  if (user && document.getElementById('dropdown-email')) {
    document.getElementById('dropdown-email').textContent = user.email || '';
  }
}

// Close user dropdown if clicking outside
document.addEventListener('click', (e) => {
  const userBar = document.getElementById('auth-user-bar');
  const menu = document.getElementById('user-dropdown-menu');
  if (menu && !menu.classList.contains('hidden') && userBar && !userBar.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

function handleRoleSelectionChange() {
  const role = document.getElementById('signup-role').value;
  const pinInput = document.getElementById('signup-pin');
  if (pinInput) {
    pinInput.value = role === 'organizer' ? '9999' : (role === 'volunteer' ? '1234' : '0000');
  }
}

function showAuthFeedback(msg, type = 'error') {
  const fb = document.getElementById('auth-modal-feedback');
  if (!fb) return;
  fb.className = `auth-feedback alert-${type}`;
  fb.textContent = msg;
  fb.classList.remove('hidden');
}

function clearAuthFeedback() {
  const fb = document.getElementById('auth-modal-feedback');
  if (fb) fb.classList.add('hidden');
}

// ----------------------------------------------------
// 8. Auth Form Submissions (Connecting to Backend API)
// ----------------------------------------------------
async function submitSignIn(event) {
  event.preventDefault();
  const email = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  const btn = document.getElementById('btn-submit-signin');

  btn.disabled = true;
  btn.textContent = 'Verifying...';

  const res = await Auth.login(email, password);
  btn.disabled = false;
  btn.textContent = 'Sign In';

  if (res.success) {
    showToast(`Signed in: ${res.user.fullName || res.user.email}`, 'success');
    closeAuthModal();
  } else {
    showAuthFeedback(res.error, 'error');
  }
}

async function submitSignUp(event) {
  event.preventDefault();
  const fullName = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const role = document.getElementById('signup-role').value;
  const pinCode = document.getElementById('signup-pin').value.trim();
  const password = document.getElementById('signup-password').value;
  const btn = document.getElementById('btn-submit-signup');

  btn.disabled = true;
  btn.textContent = 'Creating Account...';

  const res = await Auth.register({ fullName, email, role, pinCode, password });
  btn.disabled = false;
  btn.textContent = 'Create Account';

  if (res.success) {
    showToast(res.message, 'success');
    closeAuthModal();
  } else {
    showAuthFeedback(res.error, 'error');
  }
}

async function submitPinLogin(event) {
  event.preventDefault();
  const role = document.getElementById('pin-role').value;
  const pin = document.getElementById('pin-input').value.trim();
  const btn = document.getElementById('btn-submit-pin');

  btn.disabled = true;
  btn.textContent = 'Authorizing...';

  const res = await Auth.pinLogin(role, pin);
  btn.disabled = false;
  btn.textContent = 'Unlock Desk Station';

  if (res.success) {
    showToast(res.message, 'success');
    closeAuthModal();
  } else {
    showAuthFeedback(res.error, 'error');
  }
}

async function handleLogout() {
  const menu = document.getElementById('user-dropdown-menu');
  if (menu) menu.classList.add('hidden');
  await Auth.logout();
  showToast('Signed out successfully.', 'info');
}

// ----------------------------------------------------
// 9. Toast Notification System
// ----------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.25s ease-out, transform 0.25s ease-out';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, 3200);
}

// Check Backend Database Status
async function checkBackendStatus() {
  try {
    const res = await fetch('/api/auth/status');
    if (res.ok) {
      const data = await res.json();
      const modePill = document.getElementById('system-mode-tag');
      const footerDb = document.getElementById('footer-db-status');
      if (modePill) {
        modePill.textContent = data.supabaseConfigured ? 'DB: Supabase Active' : 'DB: Local Storage';
        modePill.title = data.mode;
      }
      if (footerDb) {
        footerDb.innerHTML = `DB: <b>${data.supabaseConfigured ? 'Supabase Active' : 'Local Fallback'}</b>`;
      }
    }
  } catch (e) {
    console.log('[Status] Backend check info:', e.message);
  }
}

// Listen to auth events
window.addEventListener('auth:login', () => {
  checkTilePermissions();
});

window.addEventListener('auth:logout', () => {
  checkTilePermissions();
});

// ----------------------------------------------------
// 10. Dark Mode & Theme Manager
// ----------------------------------------------------
const THEME_KEY = 'eventpass_theme';

function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  updateThemeButton(theme);
}

function toggleTheme() {
  const current = getCurrentTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  showToast(`Switched to ${next} mode.`, 'info');
}

function updateThemeButton(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    btn.setAttribute('title', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  }
}

// Initial theme setup
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    setTheme(saved);
  } else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  }

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(THEME_KEY)) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
});
