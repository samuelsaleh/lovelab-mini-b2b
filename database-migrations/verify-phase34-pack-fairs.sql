-- Verify Phase 34: pack fair folders + per-user pack hiding.
-- ────────────────────────────────────────────────────────────────────────────
-- NON-DESTRUCTIVE. Everything runs inside a single transaction that ROLLBACKs
-- at the end, so no fixtures, packs, fairs or hide rows are left behind.
--
-- HOW TO RUN:
--   - Supabase SQL editor: paste the whole file and run. A successful run ends
--     with the notice "PHASE 34: ALL CHECKS PASSED". Any failed expectation
--     aborts the transaction with a RAISE EXCEPTION describing the mismatch.
--   - Local Postgres: psql "$DATABASE_URL" -f verify-phase34-pack-fairs.sql
--
-- Requires: supabase-phase20-custom-packs.sql, supabase-phase26-pack-visibility.sql
--           and supabase-phase34-pack-fairs.sql applied first.
--
-- Matrix covered:
--   pack_fairs  → shared: every authenticated user reads the same rows, and a
--                 plain agent (non-admin) may file AND unfile a pack.
--   pack_hidden → private: a user reads/writes only their own rows and cannot
--                 see or insert somebody else's.
--   cascades    → deleting a fair unfiles the pack but keeps the pack alive;
--                 deleting a pack clears both join tables.

BEGIN;

-- ── Fixtures (seeded as the privileged session role) ──
-- profiles.id FKs auth.users, so seed minimal auth.users rows too.

INSERT INTO auth.users (id, email)
VALUES
  ('cccc0000-0000-0000-0000-000000000001', 'p34_admin@test.local'),
  ('cccc0000-0000-0000-0000-000000000002', 'p34_agent_a@test.local'),
  ('cccc0000-0000-0000-0000-000000000003', 'p34_agent_b@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, role, is_agent, agent_status)
VALUES
  ('cccc0000-0000-0000-0000-000000000001', 'p34_admin@test.local',   'admin',  false, null),
  ('cccc0000-0000-0000-0000-000000000002', 'p34_agent_a@test.local', 'member', true,  'active'),
  ('cccc0000-0000-0000-0000-000000000003', 'p34_agent_b@test.local', 'member', true,  'active')
ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role, is_agent = EXCLUDED.is_agent, agent_status = EXCLUDED.agent_status;

-- Two global packs (visible to everyone, so RLS on packs never masks the
-- pack_fairs assertions below) and two fairs.
INSERT INTO public.packs (id, label, description, fixed_total, form_rows, scope, created_by, is_seed)
VALUES
  ('dddd0000-0000-0000-0000-000000000001', 'P34 Pack One', '{}', 1000, '[{"collection":"CUTY"}]'::jsonb, 'global', NULL, false),
  ('dddd0000-0000-0000-0000-000000000002', 'P34 Pack Two', '{}', 1000, '[{"collection":"CUTY"}]'::jsonb, 'global', NULL, false);

INSERT INTO public.events (id, name, type, created_by)
VALUES
  ('eeee0000-0000-0000-0000-000000000001', 'P34 Fair Paris',     'fair', 'cccc0000-0000-0000-0000-000000000001'),
  ('eeee0000-0000-0000-0000-000000000002', 'P34 Fair Frankfurt', 'fair', 'cccc0000-0000-0000-0000-000000000001');

-- Pack One sits in BOTH fairs (many-to-many). Pack Two is unfiled.
INSERT INTO public.pack_fairs (pack_id, event_id, added_by)
VALUES
  ('dddd0000-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000001'),
  ('dddd0000-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-000000000002', 'cccc0000-0000-0000-0000-000000000001');

-- Agent A hides Pack One for themselves only.
INSERT INTO public.pack_hidden (pack_id, user_id)
VALUES ('dddd0000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000002');

-- ── Helpers: run a count as a given user, under RLS ──
-- Impersonates the user by switching to the `authenticated` role and setting
-- the JWT `sub` claim (which auth.uid() reads). SET LOCAL inside a function is
-- reverted automatically when the function returns.

CREATE OR REPLACE FUNCTION pg_temp.as_user_count_fairs(p_user uuid, p_pack uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.pack_fairs WHERE pack_id = p_pack;
  RETURN n;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.as_user_count_hidden(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.pack_hidden;
  RETURN n;
END;
$fn$;

-- ── 1. pack_fairs is shared: everyone sees the same two rows ──
DO $$
DECLARE
  admin_id  uuid := 'cccc0000-0000-0000-0000-000000000001';
  agentA_id uuid := 'cccc0000-0000-0000-0000-000000000002';
  agentB_id uuid := 'cccc0000-0000-0000-0000-000000000003';
  pack_one  uuid := 'dddd0000-0000-0000-0000-000000000001';
  pack_two  uuid := 'dddd0000-0000-0000-0000-000000000002';
BEGIN
  IF pg_temp.as_user_count_fairs(admin_id,  pack_one) <> 2 THEN RAISE EXCEPTION 'FAIL: admin should see pack one in 2 fairs'; END IF;
  IF pg_temp.as_user_count_fairs(agentA_id, pack_one) <> 2 THEN RAISE EXCEPTION 'FAIL: agent A should see pack one in 2 fairs'; END IF;
  IF pg_temp.as_user_count_fairs(agentB_id, pack_one) <> 2 THEN RAISE EXCEPTION 'FAIL: agent B should see pack one in 2 fairs'; END IF;
  IF pg_temp.as_user_count_fairs(agentB_id, pack_two) <> 0 THEN RAISE EXCEPTION 'FAIL: pack two must be unfiled'; END IF;

  RAISE NOTICE 'PHASE 34: pack_fairs SELECT is shared — PASSED';
END $$;

-- ── 2. A non-admin can file AND unfile a pack ──
DO $$
DECLARE
  n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'cccc0000-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.pack_fairs (pack_id, event_id, added_by)
  VALUES ('dddd0000-0000-0000-0000-000000000002', 'eeee0000-0000-0000-0000-000000000001',
          'cccc0000-0000-0000-0000-000000000003');

  SELECT count(*) INTO n FROM public.pack_fairs
  WHERE pack_id = 'dddd0000-0000-0000-0000-000000000002';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: non-admin insert into pack_fairs did not land'; END IF;

  DELETE FROM public.pack_fairs
  WHERE pack_id = 'dddd0000-0000-0000-0000-000000000002'
    AND event_id = 'eeee0000-0000-0000-0000-000000000001';

  SELECT count(*) INTO n FROM public.pack_fairs
  WHERE pack_id = 'dddd0000-0000-0000-0000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin delete from pack_fairs did not apply'; END IF;

  RAISE NOTICE 'PHASE 34: non-admin can file/unfile — PASSED';
END $$;
RESET ROLE;

-- ── 3. pack_hidden is private per user ──
DO $$
DECLARE
  admin_id  uuid := 'cccc0000-0000-0000-0000-000000000001';
  agentA_id uuid := 'cccc0000-0000-0000-0000-000000000002';
  agentB_id uuid := 'cccc0000-0000-0000-0000-000000000003';
BEGIN
  -- Agent A hid one pack → sees exactly their own row.
  IF pg_temp.as_user_count_hidden(agentA_id) <> 1 THEN RAISE EXCEPTION 'FAIL: agent A should see their own hide row'; END IF;
  -- Nobody else sees it, admins included.
  IF pg_temp.as_user_count_hidden(agentB_id) <> 0 THEN RAISE EXCEPTION 'FAIL: agent B must NOT see agent A hide row'; END IF;
  IF pg_temp.as_user_count_hidden(admin_id)  <> 0 THEN RAISE EXCEPTION 'FAIL: admin must NOT see agent A hide row'; END IF;

  RAISE NOTICE 'PHASE 34: pack_hidden is per-user — PASSED';
END $$;

-- ── 4. A user cannot hide a pack on somebody else's behalf ──
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'cccc0000-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.pack_hidden (pack_id, user_id)
    VALUES ('dddd0000-0000-0000-0000-000000000002', 'cccc0000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'FAIL: a user must NOT be able to hide a pack for another user';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- expected: RLS blocked the write
  END;
  RAISE NOTICE 'PHASE 34: pack_hidden write guard — PASSED';
END $$;
RESET ROLE;

-- ── 5. Cascades: deleting a fair unfiles but keeps the pack ──
DO $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.events WHERE id = 'eeee0000-0000-0000-0000-000000000002';

  SELECT count(*) INTO n FROM public.pack_fairs
  WHERE pack_id = 'dddd0000-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: deleting a fair should drop exactly its pack_fairs rows (got % remaining)', n; END IF;

  SELECT count(*) INTO n FROM public.packs WHERE id = 'dddd0000-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: deleting a fair must NOT delete the pack'; END IF;

  RAISE NOTICE 'PHASE 34: fair delete cascade — PASSED';
END $$;

-- ── 6. Cascades: deleting a pack clears both join tables ──
DO $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.packs WHERE id = 'dddd0000-0000-0000-0000-000000000001';

  SELECT count(*) INTO n FROM public.pack_fairs
  WHERE pack_id = 'dddd0000-0000-0000-0000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: deleting a pack should clear pack_fairs'; END IF;

  SELECT count(*) INTO n FROM public.pack_hidden
  WHERE pack_id = 'dddd0000-0000-0000-0000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: deleting a pack should clear pack_hidden'; END IF;

  RAISE NOTICE 'PHASE 34: pack delete cascade — PASSED';
  RAISE NOTICE 'PHASE 34: ALL CHECKS PASSED';
END $$;

ROLLBACK;
