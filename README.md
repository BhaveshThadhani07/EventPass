# 🎟️ EventPass - Event Registration & Authentication System

> **College Project: EventPass**  
> **Team Members:** Bhavesh Thadhani, Aniket Hinge  
> **Stack:** HTML5, CSS3, JavaScript (Frontend) | Node.js, Express (Backend) | Supabase PostgreSQL (Database)

---

## 📌 Project Overview
**EventPass** is an end-to-end event registration, admission, and check-in management system. It provides role-based access control (RBAC) separating **Event Organizers**, **Check-in Volunteers**, and **Attendees**, complete with instant QR/PIN authentication for rapid queue check-in desks.

---

## 🚀 Key Features

### 1. End-to-End Authentication & Authorization
- **Email & Password Authentication**: Full Sign Up and Sign In flow with bcrypt-hashed passwords.
- **JWT Session Management**: Tokens signed with secret keys, stored securely, and automatically refreshed across sessions.
- **Role-Based Access Control (RBAC)**:
  - **Organizer (`organizer`)**: Full access to all screens, admin telemetry, live stats, CSV export, and pass revocation.
  - **Volunteer (`volunteer`)**: Dedicated gate and meal check-in scanner mode.
  - **Attendee (`attendee`)**: Registration and digital pass wallet.
- **⚡ Rapid Desk PIN Unlock**: Fast 4-digit PIN authentication (Volunteer: `1234`, Organizer: `9999`) for volunteers standing at noisy entrance gates where typing long credentials causes queues.
- **Session Profile Verification (`/api/auth/me`)**: Validates tokens and restores sessions on browser reloads.
- **Security Audit Logging (`auth_audit_logs`)**: Records all logins, logouts, PIN entries, and failed attempts with timestamps.

### 2. Dual Database Architecture (Supabase + Local Fallback)
- **Supabase Cloud PostgreSQL Database**: Dedicated `profiles` and `auth_audit_logs` schema with Row Level Security (RLS).
- **Zero-Friction Fallback Store**: If Supabase credentials are not configured yet, the app runs smoothly with an integrated local persistent fallback, allowing immediate testing out of the box!

### 3. Event Pass Registration & Door Check-In
- Alphanumeric ticket ID generation (`EP-XXXX-XXXX`) using cryptographically secure random values (`crypto.getRandomValues`).
- Duplicate gate entry detection with amber alert warnings.
- Meal tracking counter by dietary preference (Veg, Non-Veg, Jain, Vegan).
- Real-time attendance counters and CSV export with UTF-8 BOM.

---

## 🛠️ Project Structure

```
├── .env                  # Environment variables (Port, JWT Secret, Supabase keys)
├── .env.example          # Environment variable template
├── auth.js               # Frontend authentication client & session manager
├── authMiddleware.js     # Express JWT verification & RBAC middleware
├── authRoutes.js         # Backend REST API authentication endpoints
├── db.js                 # IndexedDB Promise wrapper for client-side storage
├── index.html            # Main Single Page Application interface
├── package.json          # Node.js dependencies and project scripts
├── server.js             # Express backend server (serves static files & API)
├── style.css             # Responsive design system & PRD color palette
├── supabaseClient.js     # Supabase DB integration layer with fallback store
├── supabase-schema.sql   # SQL migration script for Supabase SQL Editor
└── test.js               # Automated authentication test suite
```

---

## ⚡ Quick Start Guide

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd OJT-international-main
npm install
```

### 2. Run the Server
```bash
npm start
```
The server will start at: **`http://localhost:5000`**  
Open this URL in any modern web browser.

### 3. Run Automated Tests
```bash
npm test
```
Runs the 6-point authentication test suite (registration, password validation, duplicate prevention, JWT sessions, and desk PINs).

---

## 👥 Default Demo Accounts

For evaluator demonstrations and testing, the following accounts are pre-seeded:

| Role | Name | Email | Password | Quick PIN |
|---|---|---|---|---|
| **Organizer** | Bhavesh Thadhani | `bhavesh@eventpass.edu` | `admin123` | `9999` |
| **Organizer** | Aniket Hinge | `aniket@eventpass.edu` | `admin123` | `8888` |
| **Volunteer** | Karan (Desk Staff) | `karan@eventpass.edu` | `volunteer123` | `1234` |
| **Attendee** | Ananya Kulkarni | `ananya@eventpass.edu` | `attendee123` | `0000` |

> 💡 **Tip:** On the Sign In modal, click any of the **1-Click Demo Accounts** chips to instantly fill credentials!

---

## 🗄️ Setting Up Supabase (Cloud Database)

To connect EventPass to your cloud Supabase database:

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase Dashboard.
3. Open [`supabase-schema.sql`](file:///C:/Users/bhave/Projects/OJT-international-main/supabase-schema.sql) from this repository, paste the contents into the SQL Editor, and click **Run**.
4. In Supabase, go to **Project Settings** -> **API**.
5. Copy your **Project URL** and **anon public key**.
6. Open `.env` and set:
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
7. Restart the server (`npm start`). EventPass will automatically detect Supabase and switch to live cloud database mode!

---

## 📡 API Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new account with role & PIN | No |
| `POST` | `/api/auth/login` | Sign in with email and password | No |
| `POST` | `/api/auth/pin-login` | Quick 4-digit PIN desk authorization | No |
| `GET` | `/api/auth/me` | Fetch profile for current token | Bearer Token |
| `POST` | `/api/auth/logout` | Invalidate session & log audit | Bearer Token |
| `GET` | `/api/auth/status` | Database connection mode & demo info | No |
| `GET` | `/api/health` | Backend health check | No |

---

## 🎨 Design & Palette
Designed according to the EventPass PRD specifications:
- **Primary Color:** `#0369A1` (Cerulean)
- **Valid / Checked-in:** `#166534` on `#DCFCE7`
- **Duplicate / Warning:** `#92400E` on `#FEF3C7`
- **Error / Not Found:** `#991B1B` on `#FEE2E2`
- **Text:** `#1F2937`
- **Responsive Layout:** Optimized for mobile phones (< 576px) and desktop browsers.
