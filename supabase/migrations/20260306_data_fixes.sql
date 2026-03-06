-- Data fix: Rename "Chagai Goldstoff Organization" to "Venson Amsterdam"
update organizations
set name = 'Venson Amsterdam', updated_at = now()
where name ilike '%Chagai%Goldstoff%Organization%'
  and deleted_at is null;

-- Data fix: Link Josephine's existing folder to her org.
-- Find Josephine's profile and her org, then update the folder named "josephine 1"
-- to be owned by Josephine's agent_id (if not already).
-- This is safe to run multiple times (idempotent).
do $$
declare
  v_josephine_id uuid;
  v_org_id uuid;
begin
  select id, organization_id into v_josephine_id, v_org_id
  from profiles
  where email ilike '%josephineberazzal%'
    and is_agent = true
  limit 1;

  if v_josephine_id is not null then
    update agent_folders
    set agent_id = v_josephine_id
    where name ilike '%josephine%'
      and parent_id is null
      and agent_id != v_josephine_id;
  end if;
end $$;
