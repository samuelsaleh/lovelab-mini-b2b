-- =============================================
-- LoveLab B2B - Phase 4: Database Fixes & Improvements
-- Run this in Supabase SQL Editor AFTER phase 3
-- =============================================

-- ─── 1. Add missing indexes ───

-- profiles: index on email for auth lookups
create index if not exists idx_profiles_email on public.profiles(email);

-- events: index on created_by for filtering
create index if not exists idx_events_created_by on public.events(created_by);

-- documents: indexes on frequently queried columns
create index if not exists idx_documents_event_id on public.documents(event_id);
create index if not exists idx_documents_created_by on public.documents(created_by);
create index if not exists idx_documents_created_at on public.documents(created_at desc);
create index if not exists idx_documents_client_company on public.documents(client_company);
create index if not exists idx_documents_document_type on public.documents(document_type);

-- ─── 2. Add updated_at columns ───

-- profiles: add updated_at
alter table public.profiles
  add column if not exists updated_at timestamptz default now();

-- events: add updated_at
alter table public.events
  add column if not exists updated_at timestamptz default now();

-- documents: add updated_at
alter table public.documents
  add column if not exists updated_at timestamptz default now();

-- Auto-update updated_at on modification
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for profiles
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Trigger for events
drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
  before update on public.events
  for each row execute function public.handle_updated_at();

-- Trigger for documents
drop trigger if exists set_documents_updated_at on public.documents;
create trigger set_documents_updated_at
  before update on public.documents
  for each row execute function public.handle_updated_at();

-- ─── 3. Fix ON DELETE policies for foreign keys ───

-- documents.created_by: set null on profile deletion
-- (Can't alter FK directly, so drop and recreate)
alter table public.documents
  drop constraint if exists documents_created_by_fkey;
alter table public.documents
  add constraint documents_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- events.created_by: set null on profile deletion
alter table public.events
  drop constraint if exists events_created_by_fkey;
alter table public.events
  add constraint events_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- allowed_emails.added_by: set null on profile deletion
alter table public.allowed_emails
  drop constraint if exists allowed_emails_added_by_fkey;
alter table public.allowed_emails
  add constraint allowed_emails_added_by_fkey
  foreign key (added_by) references public.profiles(id) on delete set null;

-- ─── 4. Add missing DELETE RLS policy for events ───

create policy "Authenticated users can delete events"
  on public.events for delete
  to authenticated
  using (true);

-- ─── 5. Add soft delete support (deleted_at column) ───

alter table public.documents
  add column if not exists deleted_at timestamptz default null;

-- Update the documents SELECT policy to exclude soft-deleted records
-- First drop the existing one, then recreate
drop policy if exists "Authenticated users can view documents" on public.documents;
create policy "Authenticated users can view documents"
  on public.documents for select
  to authenticated
  using (deleted_at is null);

-- ─── 6. Add clients table if not exists ───
-- (Referenced in code but may not have been created yet)
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text,
  company text not null,
  country text,
  address text,
  city text,
  zip text,
  email text,
  phone text,
  vat text,
  vat_valid boolean,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS for clients
alter table public.clients enable row level security;

-- RLS Policies for clients (if table was just created)
do $$ begin
  create policy "Authenticated users can view clients"
    on public.clients for select
    to authenticated
    using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Authenticated users can create clients"
    on public.clients for insert
    to authenticated
    with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Authenticated users can update clients"
    on public.clients for update
    to authenticated
    using (true);
exception when duplicate_object then null;
end $$;

-- Index on clients
create index if not exists idx_clients_created_by on public.clients(created_by);
create index if not exists idx_clients_company on public.clients(company);
create index if not exists idx_clients_updated_at on public.clients(updated_at desc);

-- Trigger for clients updated_at
drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at
  before update on public.clients
  for each row execute function public.handle_updated_at();
