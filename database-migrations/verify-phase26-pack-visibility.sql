-- Verify Phase 26 RLS: per-pack agent visibility.
-- ────────────────────────────────────────────────────────────────────────────
-- NON-DESTRUCTIVE. Everything runs inside a single transaction that ROLLBACKs
-- at the end, so no fixtures, packs, or assignments are left behind.
--
-- HOW TO RUN:
--   - Supabase SQL editor: paste the whole file and run. A successful run ends
--     with the notice "PHASE 26 RLS: ALL CHECKS PASSED". Any failed expectation
--     aborts the transaction with a RAISE EXCEPTION describing the mismatch.
--   - Local Postgres: psql "$DATABASE_URL" -f verify-phase26-pack-visibility.sql
--
-- Requires: supabase-phase20-custom-packs.sql and
--           supabase-phase26-pack-visibility.sql applied first.
--
-- Matrix covered (SELECT visibility):
--   global pack     → everyone (admin, assigned agent, unassigned agent)
--   private pack    → owner only; NOT another agent, NOT an admin (locked rule)
--   restricted pack → assigned agent + any admin; NOT an unassigned agent
--
-- Plus a write check: a non-admin cannot insert into pack_visibility.

BEGIN;

-- ── Fixtures (seeded as the privileged session role) ──
-- profiles.id FKs auth.users, so seed minimal auth.users rows too.

INSERT INTO auth.users (id, email)
VALUES
  ('aaaa0000-0000-0000-0000-000000000001', 'rls_admin@test.local'),
  ('aaaa0000-0000-0000-0000-000000000002', 'rls_agent_a@test.local'),
  ('aaaa0000-0000-0000-0000-000000000003', 'rls_agent_b@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, role, is_agent, agent_status)
VALUES
  ('aaaa0000-0000-0000-0000-000000000001', 'rls_admin@test.local',   'admin',  false, null),
  ('aaaa0000-0000-0000-0000-000000000002', 'rls_agent_a@test.local', 'member', true,  'active'),
  ('aaaa0000-0000-0000-0000-000000000003', 'rls_agent_b@test.local', 'member', true,  'active')
ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role, is_agent = EXCLUDED.is_agent, agent_status = EXCLUDED.agent_status;

-- One global, one private (owned by agent A), one restricted (assigned to A).
INSERT INTO public.packs (id, label, description, fixed_total, form_rows, scope, created_by, is_seed)
VALUES
  ('bbbb0000-0000-0000-0000-000000000001', 'RLS Global',     '{}', 1000, '[{"collection":"CUTY"}]'::jsonb, 'global',     NULL,                                   false),
  ('bbbb0000-0000-0000-0000-000000000002', 'RLS Private A',  '{}', 1000, '[{"collection":"CUTY"}]'::jsonb, 'private',    'aaaa0000-0000-0000-0000-000000000002', false),
  ('bbbb0000-0000-0000-0000-000000000003', 'RLS Restricted', '{}', 1000, '[{"collection":"CUTY"}]'::jsonb, 'restricted', 'aaaa0000-0000-0000-0000-000000000001', false);

INSERT INTO public.pack_visibility (pack_id, agent_id)
VALUES ('bbbb0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000002');

-- ── Helper: count packs a given user can SELECT, under RLS ──
-- Impersonates the user by switching to the `authenticated` role and setting
-- the JWT `sub` claim (which auth.uid() reads). SET LOCAL inside a function is
-- reverted automatically when the function returns.

CREATE OR REPLACE FUNCTION pg_temp.can_see(p_user uuid, p_pack uuid)
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

-- ── Assertions: any mismatch raises and aborts the transaction ──
DO $$
DECLARE
  admin_id        uuid := 'aaaa0000-0000-0000-0000-000000000001';
  agentA_id       uuid := 'aaaa0000-0000-0000-0000-000000000002';
  agentB_id       uuid := 'aaaa0000-0000-0000-0000-000000000003';
  pack_global     uuid := 'bbbb0000-0000-0000-0000-000000000001';
  pack_private    uuid := 'bbbb0000-0000-0000-0000-000000000002';
  pack_restricted uuid := 'bbbb0000-0000-0000-0000-000000000003';
BEGIN
  -- Global: visible to everyone.
  IF pg_temp.can_see(admin_id,  pack_global) <> 1 THEN RAISE EXCEPTION 'FAIL: admin should see global pack'; END IF;
  IF pg_temp.can_see(agentA_id, pack_global) <> 1 THEN RAISE EXCEPTION 'FAIL: agent A should see global pack'; END IF;
  IF pg_temp.can_see(agentB_id, pack_global) <> 1 THEN RAISE EXCEPTION 'FAIL: agent B should see global pack'; END IF;

  -- Private: owner yes; other agent no; admin NO (locked rule).
  IF pg_temp.can_see(agentA_id, pack_private) <> 1 THEN RAISE EXCEPTION 'FAIL: owner should see own private pack'; END IF;
  IF pg_temp.can_see(agentB_id, pack_private) <> 0 THEN RAISE EXCEPTION 'FAIL: agent B must NOT see another agent private pack'; END IF;
  IF pg_temp.can_see(admin_id,  pack_private) <> 0 THEN RAISE EXCEPTION 'FAIL: admin must NOT see an agent private pack (locked rule)'; END IF;

  -- Restricted: assigned agent yes; unassigned agent no; admin yes.
  IF pg_temp.can_see(agentA_id, pack_restricted) <> 1 THEN RAISE EXCEPTION 'FAIL: assigned agent should see restricted pack'; END IF;
  IF pg_temp.can_see(agentB_id, pack_restricted) <> 0 THEN RAISE EXCEPTION 'FAIL: unassigned agent must NOT see restricted pack'; END IF;
  IF pg_temp.can_see(admin_id,  pack_restricted) <> 1 THEN RAISE EXCEPTION 'FAIL: admin should see restricted pack'; END IF;

  RAISE NOTICE 'PHASE 26 RLS: ALL SELECT CHECKS PASSED';
END $$;

-- ── Write guard: a non-admin cannot insert pack_visibility rows ──
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'aaaa0000-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.pack_visibility (pack_id, agent_id)
    VALUES ('bbbb0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'FAIL: non-admin must NOT be able to insert pack_visibility';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- expected: RLS blocked the write
  END;
  RAISE NOTICE 'PHASE 26 RLS: WRITE GUARD PASSED';
  RAISE NOTICE 'PHASE 26 RLS: ALL CHECKS PASSED';
END $$;

ROLLBACK;
