-- =============================================
-- LoveLab B2B - Supabase Database Setup
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Create profiles table (stores user info after Google sign-in)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  role text default 'member' check (role in ('admin', 'member')),
  created_at timestamptz default now()
);

-- 2. Create allowed_emails table (email allowlist for access control)
create table if not exists public.allowed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  added_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 3. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;

-- 4. RLS Policies for profiles
-- Users can view their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Allow insert for authenticated users (needed for profile creation on first login)
create policy "Enable insert for authenticated users"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 5. RLS Policies for allowed_emails
-- All authenticated users can read allowed emails (needed for email check)
create policy "Authenticated users can view allowed emails"
  on public.allowed_emails for select
  to authenticated
  using (true);

-- Only admins can insert new allowed emails
create policy "Admins can insert allowed emails"
  on public.allowed_emails for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Only admins can delete allowed emails
create policy "Admins can delete allowed emails"
  on public.allowed_emails for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- =============================================
-- IMPORTANT: Add your team's emails below!
-- Replace with actual email addresses
-- =============================================

-- Example: Insert allowed team emails
-- insert into public.allowed_emails (email) values
--   ('samuel@love-lab.com'),
--   ('team.member1@gmail.com'),
--   ('team.member2@gmail.com');

-- =============================================
-- Future tables (Phase 3+)
-- =============================================

-- Events table (trade fairs)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  start_date date,
  end_date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Enable RLS for events
alter table public.events enable row level security;

-- All authenticated users can view and manage events
create policy "Authenticated users can view events"
  on public.events for select
  to authenticated
  using (true);

create policy "Authenticated users can create events"
  on public.events for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update events"
  on public.events for update
  to authenticated
  using (true);
