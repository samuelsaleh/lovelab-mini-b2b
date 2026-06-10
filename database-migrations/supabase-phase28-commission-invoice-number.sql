-- Phase 28: Manual invoice number on agent commissions
-- ────────────────────────────────────────────────────────────────────────────
-- Adds a free-text `invoice_number` column to agent_commissions so an admin can
-- jot down the matching invoice number per commission row (e.g. to reconcile a
-- payout against the accounting invoice). Purely a manual note — nothing else
-- reads or validates it.
--
-- SAFE TO RE-RUN: IF NOT EXISTS guard. Zero impact on existing rows (defaults
-- to NULL).

ALTER TABLE public.agent_commissions
  ADD COLUMN IF NOT EXISTS invoice_number text;

-- Verification (optional):
-- SELECT id, type, status, invoice_number FROM public.agent_commissions LIMIT 5;
