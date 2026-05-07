-- Phase 19 fix — Extend agent_commissions.type CHECK constraint to include
-- 'new_client_bonus'. The original constraint from Phase 8 only allowed
-- 'order' and 'bonus'. New-client bonus rows need their own type value.
--
-- Idempotent. Safe to run multiple times.

ALTER TABLE public.agent_commissions
  DROP CONSTRAINT IF EXISTS agent_commissions_type_check;

ALTER TABLE public.agent_commissions
  ADD CONSTRAINT agent_commissions_type_check
  CHECK (type IN ('order', 'bonus', 'new_client_bonus'));

-- Sanity check
DO $$
BEGIN
  RAISE NOTICE 'Phase 19 fix OK — agent_commissions_type_check now allows order / bonus / new_client_bonus';
END $$;
