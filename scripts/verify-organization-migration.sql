-- Post-migration verification checks for organization-first rollout.
-- Run after applying organization migrations in staging/prod.

-- 1) Agents without organization assignment (should be 0).
select count(*) as agents_without_organization
from profiles
where is_agent = true
  and organization_id is null;

-- 2) Organizations without at least one active membership (should be 0 in normal state).
select o.id, o.name
from organizations o
left join organization_memberships om
  on om.organization_id = o.id
 and om.deleted_at is null
where o.deleted_at is null
group by o.id, o.name
having count(om.id) = 0;

-- 3) Agent profiles missing organization membership (should be 0).
select p.id, p.email
from profiles p
left join organization_memberships om
  on om.organization_id = p.organization_id
 and om.user_id = p.id
 and om.deleted_at is null
where p.is_agent = true
  and p.organization_id is not null
  and om.id is null;

-- 4) Invitation hygiene: expired but unaccepted invites.
select id, organization_id, email, expires_at
from organization_invitations
where accepted_at is null
  and deleted_at is null
  and expires_at < now();
