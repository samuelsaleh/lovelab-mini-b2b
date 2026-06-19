-- Verify Phase 27 RLS: admins can see ALL packs (private included).
-- ────────────────────────────────────────────────────────────────────────────
-- NON-DESTRUCTIVE. Everything runs inside a single transaction that ROLLBACKs
-- at the end, so no fixtures, packs, or assignments are left behind.
--
-- HOW TO RUN:
--   - Supabase SQL editor: paste the whole file and run. A successful run ends
--     with the notice "PHASE 27 RLS: ALL CHECKS PASSED". Any failed expectation
--     aborts the transaction with a RAISE EXCEPTION describing the mismatch.
--   - Local Postgres: psql "$DATABASE_URL" -f verify-phase27-admin-see-all-packs.sql
--
-- Requires: supabase-phase20-custom-packs.sql, supabase-phase26-pack-visibility.sql
--           and supabase-phase27-admin-see-all-packs.sql applied first.
--
-- Matrix covered (SELECT visibility) — the ONLY change vs Phase 26 is that an
-- admin can now see another agent's PRIVATE pack:
--   global pack     → everyone
--   private pack    → owner YES; another agent NO; admin YES (changed)
--   restricted pack → assigned agent + any admin; unassigned agent NO
--
-- Plus a write guard: an admin still cannot DELETE another user's private pack.

BEGIN;

INSERT INTO auth.users (id, email)
VALUES
  ('cccc0000-0000-0000-0000-000000000001', 'p27_admin@test.local'),
  ('cccc0000-0000-0000-0000-000000000002', 'p27_agent_a@test.local'),
  ('cccc0000-0000-0000-0000-000000000003', 'p27_agent_b@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, role, is_agent, agent_status)
VALUES
  ('cccc0000-0000-0000-0000-000000000001', 'p27_admin@test.local',   'admin',  false, null),
  ('cccc0000-0000-0000-0000-000000000002', 'p27_agent_a@test.local', 'member', true,  'active'),
  ('cccc0000-0000-0000-0000-000000000003', 'p27_agent_b@test.local', 'member', true,  'active')
ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role, is_agent = EXCLUDED.is_agent, agent_status = EXCLUDED.agent_status;

-- One global, one private (owned by agent A), one restricted (assigned to A).
INSERT INTO public.packs (id, label, description, fixed_total, form_rows, scope, created_by, is_seed)
VALUES
  ('dddd0000-0000-0000-0000-000000000001', 'P27 Global',     '{}', 1000, '[{"collection":"CUTY"}]'::jsonb, 'global',     NULL,                                   false),
  ('dddd0000-0000-0000-0000-000000000002', 'P27 Private A',  '{}', 1000, '[{"collection":"CUTY"}]'::jsonb, 'private',    'cccc0000-0000-0000-0000-000000000002', false),
  ('dddd0000-0000-0000-0000-000000000003', 'P27 Restricted', '{}', 1000, '[{"collection":"CUTY"}]'::jsonb, 'restricted', 'cccc0000-0000-0000-0000-000000000001', false);

INSERT INTO public.pack_visibility (pack_id, agent_id)
VALUES ('dddd0000-0000-0000-0000-000000000003', 'cccc0000-0000-0000-0000-000000000002');

CREATE OR REPLACE FUNCTION pg_temp.can_see27(p_user uuid, p_pack uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.packs WHERE id = p_pack;
  RETURN n;
END;
$fn$;

DO $$
DECLARE
  admin_id        uuid := 'cccc0000-0000-0000-0000-000000000001';
  agentA_id       uuid := 'cccc0000-0000-0000-0000-000000000002';
  agentB_id       uuid := 'cccc0000-0000-0000-0000-000000000003';
  pack_global     uuid := 'dddd0000-0000-0000-0000-000000000001';
  pack_private    uuid := 'dddd0000-0000-0000-0000-000000000002';
  pack_restricted uuid := 'dddd0000-0000-0000-0000-000000000003';
BEGIN
  -- Global: visible to everyone.
  IF pg_temp.can_see27(admin_id,  pack_global) <> 1 THEN RAISE EXCEPTION 'FAIL: admin should see global pack'; END IF;
  IF pg_temp.can_see27(agentA_id, pack_global) <> 1 THEN RAISE EXCEPTION 'FAIL: agent A should see global pack'; END IF;
  IF pg_temp.can_see27(agentB_id, pack_global) <> 1 THEN RAISE EXCEPTION 'FAIL: agent B should see global pack'; END IF;

  -- Private: owner yes; other agent no; admin YES now (the Phase 27 change).
  IF pg_temp.can_see27(agentA_id, pack_private) <> 1 THEN RAISE EXCEPTION 'FAIL: owner should see own private pack'; END IF;
  IF pg_temp.can_see27(agentB_id, pack_private) <> 0 THEN RAISE EXCEPTION 'FAIL: agent B must NOT see another agent private pack'; END IF;
  IF pg_temp.can_see27(admin_id,  pack_private) <> 1 THEN RAISE EXCEPTION 'FAIL: admin SHOULD now see an agent private pack'; END IF;

  -- Restricted: assigned agent yes; unassigned agent no; admin yes.
  IF pg_temp.can_see27(agentA_id, pack_restricted) <> 1 THEN RAISE EXCEPTION 'FAIL: assigned agent should see restricted pack'; END IF;
  IF pg_temp.can_see27(agentB_id, pack_restricted) <> 0 THEN RAISE EXCEPTION 'FAIL: unassigned agent must NOT see restricted pack'; END IF;
  IF pg_temp.can_see27(admin_id,  pack_restricted) <> 1 THEN RAISE EXCEPTION 'FAIL: admin should see restricted pack'; END IF;

  RAISE NOTICE 'PHASE 27 RLS: ALL SELECT CHECKS PASSED';
END $$;

-- ── Write guard: an admin still cannot DELETE another user's private pack ──
DO $$
DECLARE
  deleted_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'cccc0000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- The DELETE policy still requires owner OR (admin AND non-private), so this
  -- affects zero rows even though the admin can now SEE the pack.
  DELETE FROM public.packs WHERE id = 'dddd0000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: admin must NOT be able to delete another user private pack (deleted %)', deleted_count;
  END IF;
  RAISE NOTICE 'PHASE 27 RLS: WRITE GUARD PASSED';
  RAISE NOTICE 'PHASE 27 RLS: ALL CHECKS PASSED';
END $$;

ROLLBACK;
