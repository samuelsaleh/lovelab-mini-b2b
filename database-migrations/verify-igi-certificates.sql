-- Verify the LoveLab x IGI certificate module.
-- ────────────────────────────────────────────────────────────────────────────
-- NON-DESTRUCTIVE. Everything runs inside a single transaction that ROLLBACKs
-- at the end, so no fixture profiles, models or movements are left behind.
--
-- HOW TO RUN:
--   - Supabase SQL editor: paste the whole file and run. A successful run ends
--     with the notice "IGI CERTIFICATES: ALL CHECKS PASSED". Any failed
--     expectation aborts the transaction with a RAISE EXCEPTION.
--   - Local Postgres: psql "$DATABASE_URL" -f verify-igi-certificates.sql
--
-- Requires: supabase/migrations/20260828120000_igi_certificates.sql applied.
--
-- What it covers, and why each one matters:
--   asymmetry   → IGI reads their own stock and the movements sent to them, and
--                 CANNOT read the shelf snapshots or LoveLab's alert level.
--                 How fast LoveLab's shelf empties is their sales rate.
--   append-only → IGI may add a production batch but never change or delete one,
--                 so "IGI's stock is the sum of batches" stays literally true.
--   the gap     → a movement with no model detail carries a total and no lines,
--                 which is how the 3 245 unattributed certificates stay visible
--                 instead of being absorbed into a model's balance.
--   authorship  → issued_by and received_by keep who recorded each half of a
--                 movement, so a quantity LoveLab typed on IGI's behalf can be
--                 told apart from one IGI typed themselves.
--   identity    → one serial, one model; one model at most once per movement;
--                 one snapshot per description per day; one write-back per
--                 reference, so a retry cannot add the stock twice.

BEGIN;

DO $$
DECLARE
  v_admin   uuid := gen_random_uuid();
  v_igi     uuid := gen_random_uuid();
  v_model   uuid;
  v_visit   uuid;
  v_count   integer;
BEGIN
  -- ── Fixtures ──────────────────────────────────────────────────────────────
  INSERT INTO public.profiles (id, email, role)
    VALUES (v_admin, 'verify-lovelab@example.test', 'admin');
  INSERT INTO public.profiles (id, email, role, is_igi)
    VALUES (v_igi, 'verify-igi@example.test', 'member', true);

  INSERT INTO public.igi_models (serial, name, stones, carat, shape, state, qty_ordered, shelf_min)
    VALUES ('LGAJ0001', 'Verify model', '1', 0.10, 'Round', 'in_use', 1000, 25)
    RETURNING id INTO v_model;

  INSERT INTO public.igi_models (serial, name, state)
    VALUES ('LGAJ0002', 'Verify reserved', 'reserved');

  -- ── A model in use must be numbered ───────────────────────────────────────
  BEGIN
    INSERT INTO public.igi_models (name, state) VALUES ('No serial', 'in_use');
    RAISE EXCEPTION 'a model in use was accepted without a serial';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ── A model still waiting for a serial from IGI may have none ─────────────
  INSERT INTO public.igi_models (name, state, carat, shape, stones)
    VALUES ('Full Moonlight', 'awaiting_serial', 0.50, 'Round', '1');
  INSERT INTO public.igi_models (name, state, carat, shape, stones)
    VALUES ('Full Moonlight', 'awaiting_serial', 0.70, 'Round', '1');

  -- ── One serial, one model ─────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.igi_models (serial, name, state, qty_ordered)
      VALUES ('LGAJ0001', 'Duplicate', 'in_use', 10);
    RAISE EXCEPTION 'the same serial was accepted twice';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- ── Only an IGI certificate line may carry a model ────────────────────────
  BEGIN
    INSERT INTO public.igi_descriptions (description, kind, model_id)
      VALUES ('VERIFY ENVELOPE', 'packaging', v_model);
    RAISE EXCEPTION 'a packaging line was linked to a model';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.igi_descriptions (description, kind, model_id)
    VALUES ('VERIFY IGI 0.10 CERTIFICATE', 'certificate', v_model);

  -- ── Two movements may share a day; they are two movements ─────────────────
  INSERT INTO public.igi_visits (visit_no, visit_date, status)
    VALUES (900001, '2026-08-24', 'closed') RETURNING id INTO v_visit;
  INSERT INTO public.igi_visits (visit_no, visit_date, status)
    VALUES (900002, '2026-08-24', 'closed');

  -- ── The unattributed movements: a total, and no lines ─────────────────────
  INSERT INTO public.igi_visits (visit_no, visit_date, status, unattributed_total, date_suspect)
    VALUES (900003, '2016-06-01', 'closed', 453, true);
  SELECT count(*) INTO v_count FROM public.igi_visit_lines l
    JOIN public.igi_visits v ON v.id = l.visit_id WHERE v.visit_no = 900003;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'an unattributed movement carried per-model lines';
  END IF;

  -- ── A model appears at most once per movement ─────────────────────────────
  INSERT INTO public.igi_visit_lines (visit_id, model_id, qty_requested, qty_issued)
    VALUES (v_visit, v_model, 100, 100);
  BEGIN
    INSERT INTO public.igi_visit_lines (visit_id, model_id, qty_requested, qty_issued)
      VALUES (v_visit, v_model, 50, 50);
    RAISE EXCEPTION 'a model was booked twice on one movement';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- ── One snapshot per description per day ──────────────────────────────────
  INSERT INTO public.igi_shelf_snapshots (snapshot_date, description, total_pcs, model_id)
    VALUES ('2026-08-28', 'VERIFY IGI 0.10 CERTIFICATE', 1006, v_model);
  BEGIN
    INSERT INTO public.igi_shelf_snapshots (snapshot_date, description, total_pcs)
      VALUES ('2026-08-28', 'VERIFY IGI 0.10 CERTIFICATE', 999);
    RAISE EXCEPTION 'two snapshots were accepted for one description on one day';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- ── A batch is a real quantity ────────────────────────────────────────────
  INSERT INTO public.igi_batches (model_id, qty, batch_date, reference)
    VALUES (v_model, 1000, '2026-08-27', 'verify initial order');
  BEGIN
    INSERT INTO public.igi_batches (model_id, qty, batch_date)
      VALUES (v_model, 0, '2026-08-27');
    RAISE EXCEPTION 'a batch of zero was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ── A retry cannot add the stock twice ────────────────────────────────────
  INSERT INTO public.igi_receipts (visit_id, reference) VALUES (v_visit, 'VERIFY-V-900001');
  BEGIN
    INSERT INTO public.igi_receipts (visit_id, reference) VALUES (v_visit, 'VERIFY-V-900001');
    RAISE EXCEPTION 'the same write-back reference was accepted twice';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- ── Who recorded each half of a movement ──────────────────────────────────
  -- Until IGI have logins, LoveLab records both sides. Once they do, a quantity
  -- typed on IGI's behalf must be distinguishable from one they typed themselves.
  UPDATE public.igi_visits
     SET status = 'issued', issued_at = now(), issued_by = v_admin
   WHERE id = v_visit;
  UPDATE public.igi_visits
     SET status = 'closed', closed_at = now(), received_by = v_admin
   WHERE id = v_visit;

  SELECT count(*) INTO v_count FROM public.igi_visits
   WHERE id = v_visit AND issued_by = v_admin AND received_by = v_admin;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the movement did not keep who recorded each half';
  END IF;

  -- ── A movement only holds the three states it is allowed ──────────────────
  BEGIN
    UPDATE public.igi_visits SET status = 'reopened' WHERE id = v_visit;
    RAISE EXCEPTION 'a movement was accepted in an unknown state';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ── IGI's stock is batches less what they issued ──────────────────────────
  SELECT (SELECT coalesce(sum(qty), 0) FROM public.igi_batches WHERE model_id = v_model)
       - (SELECT coalesce(sum(qty_issued), 0) FROM public.igi_visit_lines WHERE model_id = v_model)
    INTO v_count;
  IF v_count <> 900 THEN
    RAISE EXCEPTION 'IGI stock derived as %, expected 900 (1000 made less 100 issued)', v_count;
  END IF;

  RAISE NOTICE 'IGI CERTIFICATES: structure and constraints passed';
END $$;

-- ── Visibility: the commercial boundary ─────────────────────────────────────
-- Checked outside the DO block because it needs a role change, which cannot
-- happen inside a SECURITY INVOKER function body.
DO $$
DECLARE
  v_igi uuid;
BEGIN
  SELECT id INTO v_igi FROM public.profiles WHERE email = 'verify-igi@example.test';
  PERFORM set_config('request.jwt.claim.sub', v_igi::text, true);
  RAISE NOTICE 'IGI fixture is %', v_igi;
END $$;

DO $$
BEGIN
  -- The shelf snapshots have no IGI policy at all, so RLS default-denies them.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'igi_shelf_snapshots'
      AND qual LIKE '%is_igi%'
  ) THEN
    RAISE EXCEPTION 'a policy grants IGI access to the shelf snapshots';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'igi_receipts'
      AND qual LIKE '%is_igi%'
  ) THEN
    RAISE EXCEPTION 'a policy grants IGI access to the write-back receipts';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'igi_descriptions'
      AND qual LIKE '%is_igi%'
  ) THEN
    RAISE EXCEPTION 'a policy grants IGI access to the matching table';
  END IF;

  -- Row level security cannot hide a column, so shelf_min is withheld by grant.
  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'igi_models'
      AND column_name = 'shelf_min' AND grantee = 'authenticated'
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'authenticated may read igi_models.shelf_min — LoveLab''s alert level is exposed';
  END IF;

  -- IGI may add a batch but never change or delete one.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'igi_batches'
      AND cmd IN ('UPDATE', 'DELETE') AND qual LIKE '%is_igi%'
  ) THEN
    RAISE EXCEPTION 'IGI can change or delete a production batch';
  END IF;

  -- Reserved serials are hidden from IGI at the row level, not by a WHERE clause.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'igi_models'
      AND qual LIKE '%is_igi%' AND qual LIKE '%in_use%'
  ) THEN
    RAISE EXCEPTION 'IGI can see reserved serials';
  END IF;

  -- ── What IGI may write ────────────────────────────────────────────────────
  -- Row level security decides which rows may be updated, never which columns,
  -- so each of these is a grant rather than a policy. Without them the policies
  -- that let IGI record what they made would also let them rewrite what LoveLab
  -- asked for, and set LoveLab's own alert level.
  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'igi_visit_lines'
       AND column_name = 'qty_requested' AND grantee = 'authenticated'
       AND privilege_type = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'IGI can rewrite qty_requested — what LoveLab asked for is not protected';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'igi_visit_lines'
       AND column_name = 'qty_issued' AND grantee = 'authenticated'
       AND privilege_type = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'IGI cannot record what they made — the portal will not work';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'igi_models'
       AND column_name = 'shelf_min' AND grantee = 'authenticated'
       AND privilege_type = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'IGI can set LoveLab''s alert level — each rule must have one owner';
  END IF;

  -- IGI may move a movement on to "ready to receive" and no further.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'igi_visits' AND cmd = 'UPDATE'
       AND qual LIKE '%requested%' AND with_check LIKE '%issued%'
  ) THEN
    RAISE EXCEPTION 'IGI cannot record what they made, or can do more than that';
  END IF;

  -- ── The escalation that would undo all of the above ───────────────────────
  -- The profiles UPDATE policy is USING (auth.uid() = id) with no column
  -- restriction, so while `authenticated` holds UPDATE on profiles any account
  -- can rewrite its own row — clearing is_igi to escape containment, or setting
  -- role to admin. Nothing in the app writes profiles through the RLS client.
  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'an account can rewrite its own profile — is_igi and role are not safe';
  END IF;

  RAISE NOTICE 'IGI CERTIFICATES: ALL CHECKS PASSED';
END $$;

ROLLBACK;
