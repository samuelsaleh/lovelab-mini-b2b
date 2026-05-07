-- Phase 19d — Fix the unique constraint on agent_commissions so a bonus
-- and an order can coexist on the same document.
--
-- Background:
--   Phase 8 created `agent_commissions_agent_document_unique` as
--     UNIQUE (agent_id, document_id) WHERE document_id IS NOT NULL
--   The comment at the time said "Bonuses don't have document_id so they
--   won't conflict". That assumption broke in Phase 19 when we introduced
--   type='new_client_bonus' rows that DO carry a document_id (the first
--   order that triggered them) — needed for the cascade in Phase 19e where
--   ticking an order's "Customer paid?" checkbox auto-ticks the linked
--   bonus.
--
-- Fix:
--   Drop the old (agent_id, document_id) unique index and replace with
--   (agent_id, document_id, type). This still prevents duplicate orders /
--   duplicate bonuses on the same document but allows one of each.
--
-- Idempotent. Safe to run multiple times.

DROP INDEX IF EXISTS public.agent_commissions_agent_document_unique;

CREATE UNIQUE INDEX IF NOT EXISTS agent_commissions_agent_document_type_unique
  ON public.agent_commissions (agent_id, document_id, type)
  WHERE document_id IS NOT NULL;

-- Sanity check
DO $$
DECLARE
  idx_count int;
BEGIN
  SELECT count(*) INTO idx_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'agent_commissions_agent_document_type_unique';
  IF idx_count = 0 THEN
    RAISE EXCEPTION 'Phase 19d migration failed: new index not present';
  END IF;
  RAISE NOTICE 'Phase 19d OK — new unique index in place';
END $$;
