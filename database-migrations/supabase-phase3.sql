-- =============================================
-- LoveLab B2B - Phase 3: Document Storage
-- Run this in Supabase SQL Editor
-- =============================================

-- Documents table (stores metadata for saved quotes/orders)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  client_name text not null,
  client_company text,
  document_type text not null check (document_type in ('quote', 'order')),
  file_path text not null,
  file_name text not null,
  file_size integer,
  total_amount numeric(10,2),
  created_by uuid references public.profiles(id),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.documents enable row level security;

-- RLS Policies for documents
create policy "Authenticated users can view documents"
  on public.documents for select
  to authenticated
  using (true);

create policy "Authenticated users can create documents"
  on public.documents for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update documents"
  on public.documents for update
  to authenticated
  using (true);

create policy "Authenticated users can delete documents"
  on public.documents for delete
  to authenticated
  using (true);
