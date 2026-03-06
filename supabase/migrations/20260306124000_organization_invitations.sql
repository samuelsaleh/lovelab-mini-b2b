create table if not exists organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid null references profiles(id),
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create unique index if not exists org_invitations_org_email_unique
  on organization_invitations(organization_id, email);

create index if not exists org_invitations_email_idx
  on organization_invitations(email)
  where accepted_at is null and deleted_at is null;

create index if not exists org_invitations_org_idx
  on organization_invitations(organization_id)
  where deleted_at is null;
