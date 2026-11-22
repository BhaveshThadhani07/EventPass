/**
 * EventPass - Client-Side Authentication Module
 * Communicates with Node.js backend and Supabase DB
 * Supports:
 * - Email & Password Sign In
 * - Sign Up / Registration with Roles (Organizer, Volunteer, Attendee)
 * - Quick PIN Authentication for Entrance Desks
 * - Session Persistence & Auto-login
 * - Role-Based Permission Checking (RBAC)
 */

const Auth = (function() {
  const TOKEN_KEY = 'eventpass_auth_token';
  const USER_KEY = 'eventpass_auth_user';
  const API_BASE = '/api/auth';

  let currentUser = null;
  let authToken = null;

  // Initialize from localStorage
  function init() {
    authToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedUser) {
      try {
        currentUser = JSON.parse(storedUser);
      } catch (e) {
        currentUser = null;
      }
    }

    // Verify token with backend
    if (authToken) {
      verifySession();
    } else {
      updateUI();
    }
  }

  // Generic API Helper
  async function apiRequest(endpoint, method = 'GET', data = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const config = {
      method,
      headers
    };

    if (data && method !== 'GET') {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, config);
      const resData = await response.json();
      return { ok: response.ok, status: response.status, data: resData };
    } catch (err) {
      console.error(`[Auth API Error] ${endpoint}:`, err);
      return {
        ok: false,
        status: 0,
        data: { error: 'Network error or backend server not reachable. Please check if the Node.js server is running.' }
      };
    }
  }

  // 1. Sign In with Email & Password
  async function login(email, password) {
    const res = await apiRequest('/login', 'POST', { email, password });
    if (res.ok && res.data.success) {
      setSession(res.data.token, res.data.user);
      return { success: true, message: res.data.message, user: res.data.user };
    }
    return { success: false, error: res.data.error || 'Failed to sign in.' };
  }

  // 2. Sign Up (Register)
  async function register({ email, password, fullName, role, pinCode }) {
    const res = await apiRequest('/register', 'POST', {
      email,
      password,
      fullName,
      role,
      pinCode
    });

    if (res.ok && res.data.success) {
      setSession(res.data.token, res.data.user);
      return { success: true, message: res.data.message, user: res.data.user };
    }
    return { success: false, error: res.data.error || 'Registration failed.' };
  }

  // 3. Quick PIN Login (Desk mode)
  async function pinLogin(role, pin) {
    const res = await apiRequest('/pin-login', 'POST', { role, pin });
    if (res.ok && res.data.success) {
      setSession(res.data.token, res.data.user);
      return { success: true, message: res.data.message, user: res.data.user };
    }
    return { success: false, error: res.data.error || 'Incorrect PIN.' };
  }

  // 4. Verify Active Session
  async function verifySession() {
    const res = await apiRequest('/me', 'GET');
    if (res.ok && res.data.success) {
      currentUser = res.data.user;
      localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
      updateUI();
    } else {
      // Token expired or invalid
      logout(false);
    }
  }

  // 5. Sign Out
  async function logout(callBackend = true) {
    if (callBackend && authToken) {
      try {
        await apiRequest('/logout', 'POST');
      } catch (e) {}
    }

    authToken = null;
    currentUser = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    updateUI();
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  // Helper: Save session
  function setSession(token, user) {
    authToken = token;
    currentUser = user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    updateUI();
    window.dispatchEvent(new CustomEvent('auth:login', { detail: { user } }));
  }

  // Permission Checks
  function isAuthenticated() {
    return !!currentUser;
  }

  function getUser() {
    return currentUser;
  }

  function getToken() {
    return authToken;
  }

  function hasRole(...roles) {
    if (!currentUser) return false;
    return roles.includes(currentUser.role);
  }

  function isOrganizer() {
    return hasRole('organizer');
  }

  function isVolunteer() {
    return hasRole('volunteer', 'organizer');
  }

  // Update UI Elements across the page
  function updateUI() {
    const userBar = document.getElementById('auth-user-bar');
    const guestBar = document.getElementById('auth-guest-bar');
    const userNameEl = document.getElementById('auth-user-name');
    const userRoleEl = document.getElementById('auth-user-role');
    const userAvatarEl = document.getElementById('auth-user-avatar');

    if (!userBar || !guestBar) return;

    if (currentUser) {
      guestBar.classList.add('hidden');
      userBar.classList.remove('hidden');

      if (userNameEl) userNameEl.textContent = currentUser.fullName || currentUser.email;
      if (userRoleEl) {
        userRoleEl.textContent = currentUser.role.toUpperCase();
        userRoleEl.className = `role-badge role-${currentUser.role}`;
      }
      if (userAvatarEl) {
        const initials = (currentUser.fullName || currentUser.email)
          .split(' ')
          .map(n => n[0])
          .join('')
          .substring(0, 2)
          .toUpperCase();
        userAvatarEl.textContent = initials;
      }
    } else {
      userBar.classList.add('hidden');
      guestBar.classList.remove('hidden');
    }

    // Refresh role-locked tile views
    if (typeof window.checkTilePermissions === 'function') {
      window.checkTilePermissions();
    }
  }

  return {
    init,
    login,
    register,
    pinLogin,
    logout,
    verifySession,
    isAuthenticated,
    getUser,
    getToken,
    hasRole,
    isOrganizer,
    isVolunteer,
    updateUI
  };
})();

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});
