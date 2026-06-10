-- Verify Phase 27: quick-orders client_label column.
-- ────────────────────────────────────────────────────────────────────────────
-- NON-DESTRUCTIVE. Runs inside a single transaction that ROLLBACKs at the end,
-- so no fixtures are left behind.
--
-- HOW TO RUN:
--   - Supabase SQL editor: paste the whole file and run. A successful run ends
--     with the notice "PHASE 27: ALL CHECKS PASSED". Any failed expectation
--     aborts the transaction with a RAISE EXCEPTION describing the mismatch.
--   - Local Postgres: psql "$DATABASE_URL" -f verify-phase27-quick-orders.sql
--
-- Requires: supabase-phase8-agents.sql and supabase-phase27-quick-orders.sql
--           applied first.
--
-- Checks:
--   1. The client_label column exists on agent_commissions and is nullable text.
--   2. A manual quick order (type='order', document_id NULL, client_label set)
--      can be inserted and read back with the label intact.
--   3. Multiple NULL-document quick orders for the same agent do NOT collide
--      with the partial unique index (which only covers non-NULL document_id).

BEGIN;

-- ── 1. Column shape ──
DO $$
DECLARE
  v_type text;
  v_nullable text;
BEGIN
  SELECT data_type, is_nullable
    INTO v_type, v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'agent_commissions'
    AND column_name = 'client_label';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'FAIL: agent_commissions.client_label column is missing';
  END IF;
  IF v_type <> 'text' THEN
    RAISE EXCEPTION 'FAIL: client_label should be text, got %', v_type;
  END IF;
  IF v_nullable <> 'YES' THEN
    RAISE EXCEPTION 'FAIL: client_label should be nullable';
  END IF;
  RAISE NOTICE 'PHASE 27: column shape OK';
END $$;

-- ── 2 + 3. Insert + read-back, and no collision on NULL document_id ──
DO $$
DECLARE
  v_agent uuid;
  v_label text;
  v_count integer;
BEGIN
  -- Seed a throwaway agent (auth.users FK first).
  v_agent := 'cccc0000-0000-0000-0000-000000000027';
  INSERT INTO auth.users (id, email)
  VALUES (v_agent, 'phase27_agent@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, role, is_agent, agent_status, commission_rate)
  VALUES (v_agent, 'phase27_agent@test.local', 'member', true, 'active', 10)
  ON CONFLICT (id) DO UPDATE
    SET is_agent = EXCLUDED.is_agent, agent_status = EXCLUDED.agent_status;

  -- Two manual quick orders, both NULL document_id, must coexist.
  INSERT INTO public.agent_commissions
    (agent_id, document_id, type, client_label, order_total, commission_rate, commission_amount, status, customer_paid_at)
  VALUES
    (v_agent, NULL, 'order', 'Old Client A', 1000, 10, 100, 'pending', now()),
    (v_agent, NULL, 'order', 'Old Client B',  500, 10,  50, 'pending', now());

  SELECT client_label INTO v_label
  FROM public.agent_commissions
  WHERE agent_id = v_agent AND client_label = 'Old Client A';
  IF v_label IS DISTINCT FROM 'Old Client A' THEN
    RAISE EXCEPTION 'FAIL: client_label did not round-trip (got %)', v_label;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.agent_commissions
  WHERE agent_id = v_agent AND document_id IS NULL AND type = 'order';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected 2 NULL-document quick orders, got %', v_count;
  END IF;

  RAISE NOTICE 'PHASE 27: insert + read-back + no-collision OK';
  RAISE NOTICE 'PHASE 27: ALL CHECKS PASSED';
END $$;

ROLLBACK;
