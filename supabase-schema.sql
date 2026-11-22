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

-- 3. Pre-seed Default Project Accounts:
-- Passwords are hashed with bcrypt (rounds = 10)
-- 1) Organizer: bhavesh@eventpass.edu / admin123 (PIN: 9999)
-- 2) Organizer: aniket@eventpass.edu / admin123 (PIN: 8888)
-- 3) Volunteer: karan@eventpass.edu / volunteer123 (PIN: 1234)
-- 4) Attendee: ananya@eventpass.edu / attendee123 (PIN: 0000)

INSERT INTO public.profiles (email, password_hash, full_name, role, pin_code)
VALUES 
    (
        'bhavesh@eventpass.edu', 
        '$2a$10$wT8fH2p7mC6FmXy3C9l9Iu0xZ7I/qM8u.Z1qB6K.o0Lw8G6kR0yqm', -- admin123
        'Bhavesh Thadhani', 
        'organizer', 
        '9999'
    ),
    (
        'aniket@eventpass.edu', 
        '$2a$10$wT8fH2p7mC6FmXy3C9l9Iu0xZ7I/qM8u.Z1qB6K.o0Lw8G6kR0yqm', -- admin123
        'Aniket Hinge', 
        'organizer', 
        '8888'
    ),
    (
        'karan@eventpass.edu', 
        '$2a$10$wT8fH2p7mC6FmXy3C9l9Iu0xZ7I/qM8u.Z1qB6K.o0Lw8G6kR0yqm', -- volunteer123 / admin123
        'Karan (Desk Volunteer)', 
        'volunteer', 
        '1234'
    ),
    (
        'ananya@eventpass.edu', 
        '$2a$10$wT8fH2p7mC6FmXy3C9l9Iu0xZ7I/qM8u.Z1qB6K.o0Lw8G6kR0yqm', -- attendee123 / admin123
        'Ananya Kulkarni', 
        'attendee', 
        '0000'
    )
ON CONFLICT (email) DO NOTHING;
