-- ========================================================
-- EventPass - Supabase Database Schema
-- Run this script in the Supabase SQL Editor
-- ========================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create PROFILES / USERS table for application authentication
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('organizer', 'volunteer', 'attendee')),
    pin_code VARCHAR(10) DEFAULT '1234',
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow anonymous and authenticated read/write via Service Role or public API
-- (Policy for public registration and auth verification)
DROP POLICY IF EXISTS "Allow select for login verification" ON public.profiles;
CREATE POLICY "Allow select for login verification" 
ON public.profiles FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Allow registration insert" ON public.profiles;
CREATE POLICY "Allow registration insert" 
ON public.profiles FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow user update own profile" ON public.profiles;
CREATE POLICY "Allow user update own profile" 
ON public.profiles FOR UPDATE 
USING (true);

-- 2. Create Audit Logs table for security and desk activity tracking
CREATE TABLE IF NOT EXISTS public.auth_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    email TEXT,
    action TEXT NOT NULL, -- 'LOGIN', 'LOGOUT', 'REGISTER', 'PIN_LOGIN', 'FAILED_LOGIN'
    role TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.auth_audit_logs(created_at DESC);

ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow audit log access" ON public.auth_audit_logs;
CREATE POLICY "Allow audit log access"
ON public.auth_audit_logs FOR ALL
USING (true)
WITH CHECK (true);

-- 3. Create EVENTS table (simple event metadata & capacity)
CREATE TABLE IF NOT EXISTS public.events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    venue TEXT,
    event_date TEXT,
    capacity INTEGER NOT NULL DEFAULT 50 CHECK (capacity > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow event access" ON public.events;
CREATE POLICY "Allow event access"
ON public.events FOR ALL
USING (true)
WITH CHECK (true);

-- 4. Create TICKETS table (registrations, gate check-ins, and meal tracking)
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id TEXT UNIQUE NOT NULL,
    event_id TEXT NOT NULL DEFAULT 'E01' REFERENCES public.events(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    diet TEXT NOT NULL CHECK (diet IN ('Veg', 'Non-Veg', 'Jain', 'Vegan')),
    gate_checked_in BOOLEAN NOT NULL DEFAULT false,
    gate_checked_in_at TIMESTAMP WITH TIME ZONE,
    meal_claimed BOOLEAN NOT NULL DEFAULT false,
    meal_claimed_at TIMESTAMP WITH TIME ZONE,
    duplicate_attempts INTEGER NOT NULL DEFAULT 0,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (event_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id ON public.tickets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_email ON public.tickets(event_id, email);
CREATE INDEX IF NOT EXISTS idx_tickets_registered_at ON public.tickets(registered_at DESC);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow ticket access" ON public.tickets;
CREATE POLICY "Allow ticket access"
ON public.tickets FOR ALL
USING (true)
WITH CHECK (true);

-- 5. Pre-seed Default Project Accounts:
-- Passwords are hashed with bcrypt (rounds = 10)
-- 1) Organizer: bhavesh@eventpass.edu / admin123 (PIN: 9999)
-- 2) Organizer: aniket@eventpass.edu / admin123 (PIN: 8888)
-- 3) Volunteer: karan@eventpass.edu / volunteer123 (PIN: 1234)
-- 4) Attendee: ananya@eventpass.edu / attendee123 (PIN: 0000)

INSERT INTO public.profiles (email, password_hash, full_name, role, pin_code)
VALUES 
    (
        'bhavesh@eventpass.edu', 
        '$2a$10$DztIXL/sJUvSDJqZ9mLZ.urgBbiGpKo8w9uSAdUZPTcGAQSMw8MZ6', -- admin123
        'Bhavesh Thadhani', 
        'organizer', 
        '9999'
    ),
    (
        'aniket@eventpass.edu', 
        '$2a$10$DztIXL/sJUvSDJqZ9mLZ.urgBbiGpKo8w9uSAdUZPTcGAQSMw8MZ6', -- admin123
        'Aniket Hinge', 
        'organizer', 
        '8888'
    ),
    (
        'karan@eventpass.edu', 
        '$2a$10$UEHCZPO/iltGmSCrzubraOP5hJgO27OGfAYcszQam/ztc6C56E4cu', -- volunteer123
        'Karan (Desk Volunteer)', 
        'volunteer', 
        '1234'
    ),
    (
        'ananya@eventpass.edu', 
        '$2a$10$PLfGlNab40rtrT.S0foEbu.MBqo/g2wInrmsaF429O.y.fO.sSqXC', -- attendee123
        'Ananya Kulkarni', 
        'attendee', 
        '0000'
    )
ON CONFLICT (email) DO NOTHING;

-- 6. Pre-seed Default Event & Sample Tickets
INSERT INTO public.events (id, name, venue, event_date, capacity)
VALUES ('E01', 'Intro to Web Dev Workshop', 'Seminar Hall B', '2026-11-14', 50)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tickets (ticket_id, event_id, full_name, email, diet, gate_checked_in, gate_checked_in_at, meal_claimed, meal_claimed_at)
VALUES
    ('EP-7K3Q-X9M2', 'E01', 'Ananya Kulkarni', 'ananya@eventpass.edu', 'Veg', true, timezone('utc'::text, now()) - interval '1 hour', true, timezone('utc'::text, now()) - interval '20 minutes'),
    ('EP-B2XK-9HDR', 'E01', 'Sana Sheikh', 'sana@example.com', 'Non-Veg', true, timezone('utc'::text, now()) - interval '45 minutes', false, null),
    ('EP-4M8T-QW3N', 'E01', 'Rohan Patil', 'rohan@example.com', 'Jain', false, null, false, null)
ON CONFLICT (ticket_id) DO NOTHING;
