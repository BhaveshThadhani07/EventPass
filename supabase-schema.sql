-- ========================================================
-- EventPass - Simple Supabase Database Schema
-- Run this script in the Supabase SQL Editor
-- ========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES (Users: Attendee or Organizer)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('organizer', 'volunteer', 'attendee')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow profile access" ON public.profiles;
CREATE POLICY "Allow profile access"
ON public.profiles FOR ALL USING (true) WITH CHECK (true);

-- 2. AUTH AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.auth_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    email TEXT,
    action TEXT NOT NULL,
    role TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.auth_audit_logs(created_at DESC);

ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow audit log access" ON public.auth_audit_logs;
CREATE POLICY "Allow audit log access"
ON public.auth_audit_logs FOR ALL USING (true) WITH CHECK (true);

-- 3. EVENTS (Active & Passive)
CREATE TABLE IF NOT EXISTS public.events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    venue TEXT,
    event_date TEXT,
    capacity INTEGER NOT NULL DEFAULT 100 CHECK (capacity > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'passive')),
    description TEXT,
    active_qr_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow event access" ON public.events;
CREATE POLICY "Allow event access"
ON public.events FOR ALL USING (true) WITH CHECK (true);

-- If events table already existed from an earlier run, ensure new columns exist
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS active_qr_code TEXT;

-- 4. TICKETS (Event Registrations & Gate Check-ins)
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id TEXT UNIQUE NOT NULL,
    event_id TEXT NOT NULL DEFAULT 'E01' REFERENCES public.events(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    diet TEXT NOT NULL DEFAULT 'Veg' CHECK (diet IN ('Veg', 'Non-Veg', 'Jain', 'Vegan')),
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

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow ticket access" ON public.tickets;
CREATE POLICY "Allow ticket access"
ON public.tickets FOR ALL USING (true) WITH CHECK (true);

-- 5. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    unread BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_email, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow notification access" ON public.notifications;
CREATE POLICY "Allow notification access"
ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- 6. CHAT MESSAGES
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_name TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_created_at ON public.chat_messages(created_at ASC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow chat access" ON public.chat_messages;
CREATE POLICY "Allow chat access"
ON public.chat_messages FOR ALL USING (true) WITH CHECK (true);

-- 7. Seed Default Accounts (bcrypt rounds = 10)
-- Organizer: bhavesh@eventpass.edu / admin123
-- Organizer: aniket@eventpass.edu / admin123
-- Attendee:  ananya@eventpass.edu / attendee123
INSERT INTO public.profiles (email, password_hash, full_name, role)
VALUES
    ('bhavesh@eventpass.edu', '$2a$10$DztIXL/sJUvSDJqZ9mLZ.urgBbiGpKo8w9uSAdUZPTcGAQSMw8MZ6', 'Bhavesh Thadhani', 'organizer'),
    ('aniket@eventpass.edu', '$2a$10$DztIXL/sJUvSDJqZ9mLZ.urgBbiGpKo8w9uSAdUZPTcGAQSMw8MZ6', 'Aniket Hinge', 'organizer'),
    ('ananya@eventpass.edu', '$2a$10$PLfGlNab40rtrT.S0foEbu.MBqo/g2wInrmsaF429O.y.fO.sSqXC', 'Ananya Kulkarni', 'attendee')
ON CONFLICT (email) DO NOTHING;

-- 8. Seed Events (Active & Passive)
INSERT INTO public.events (id, name, venue, event_date, capacity, status, description)
VALUES
    ('E01', 'OJT Sprint Demo Day', 'Innovation Lab', 'Nov 30, 2026', 200, 'active', 'Live full-stack architecture and Liquid Glass UI evaluation with faculty mentors.'),
    ('E02', 'Bengaluru Student Hackathon', 'Open Arena', 'Dec 09, 2026', 350, 'active', '24-hour rapid build sprint with instant roster sync.'),
    ('E03', 'Winter Open-Source Code Sprint', 'Tech Hub', 'Dec 18, 2026', 120, 'active', 'Collaborative pull-request sprint and mentor code review session.'),
    ('E04', 'Constellation 2026 Campus Launch', 'Main Auditorium', 'Aug 24, 2026', 500, 'passive', 'Polaris School of Technology orientation showcase and campus event launch.'),
    ('E05', 'Cloud & Applied AI Track Workshop', 'Seminar Hall B', 'Oct 15, 2026', 200, 'passive', 'Hands-on deployment lab covering cloud runtimes, API authentication, and telemetry.'),
    ('E06', 'Freshers Induction & Club Fair', 'Central Courtyard', 'Sep 05, 2026', 550, 'passive', 'Past campus induction event retained for audit and OJT reporting.')
ON CONFLICT (id) DO NOTHING;

-- 9. Seed Sample Chat Messages
INSERT INTO public.chat_messages (sender_name, sender_email, sender_role, message)
SELECT 'OJT Coordinator Desk', 'bhavesh@eventpass.edu', 'organizer', 'Welcome to EventPass! Register for any active event and scan the gate QR code on arrival.'
WHERE NOT EXISTS (SELECT 1 FROM public.chat_messages);

-- 10. Grant API access for Supabase publishable / anon & authenticated keys
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
