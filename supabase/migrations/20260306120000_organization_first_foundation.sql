-- Organization-first architecture foundation
-- Safe to run once in staging, then production after verification.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  territory text null,
  created_by uuid null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

alter table profiles
  add column if not exists organization_id uuid null references organizations(id);

create unique index if not exists org_memberships_org_user_unique
  on organization_memberships(organization_id, user_id);

create index if not exists org_memberships_org_idx
  on organization_memberships(organization_id)
  where deleted_at is null;

create index if not exists org_memberships_user_idx
  on organization_memberships(user_id)
  where deleted_at is null;

create index if not exists profiles_organization_id_idx
  on profiles(organization_id);

-- Backfill: one organization per current active/invited agent if missing.
with agent_profiles as (
  select p.id, p.full_name, p.email
  from profiles p
  where p.is_agent = true
),
created_orgs as (
  insert into organizations (name, created_by)
  select
    coalesce(nullif(trim(ap.full_name), ''), ap.email, 'Agent Organization') || ' Organization',
    ap.id
  from agent_profiles ap
  where not exists (
    select 1 from profiles p2 where p2.id = ap.id and p2.organization_id is not null
  )
  returning id, created_by
)
update profiles p
set organization_id = co.id
from created_orgs co
where p.id = co.created_by;

insert into organization_memberships (organization_id, user_id, role)
select p.organization_id, p.id, 'owner'
from profiles p
where p.is_agent = true
  and p.organization_id is not null
on conflict (organization_id, user_id) do nothing;
