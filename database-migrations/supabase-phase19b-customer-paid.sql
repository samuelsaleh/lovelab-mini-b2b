-- =====================================================================
-- Phase 19b — Customer-paid timestamp on agent_commissions
-- =====================================================================
-- Adds the per-commission "customer has paid" toggle. Mom (admin) ticks
-- a checkbox in Commission History when the customer settles their
-- invoice; that flips this column from NULL to now(). Untick → NULL.
--
-- Drives the new 4-bucket KPI split on the agent detail page:
--   AWAITING CUSTOMER  = customer_paid_at IS NULL  AND status='pending'
--   READY TO PAY       = customer_paid_at NOT NULL AND status='pending'
--   PAID OUT           = status='paid'
--   (REVENUE stays as-is)
--
-- And drives the monthly Excel export — only READY TO PAY rows are
-- included; AWAITING CUSTOMER rolls over to next month.
--
-- SAFE TO RE-RUN: idempotent.
-- =====================================================================

ALTER TABLE public.agent_commissions
  ADD COLUMN IF NOT EXISTS customer_paid_at timestamptz;

-- Helper index for the monthly export query (status + customer_paid_at).
-- Partial: skips cancelled and bonus rows that don't follow the
-- customer-payment lifecycle.
CREATE INDEX IF NOT EXISTS idx_agent_commissions_ready_to_pay
  ON public.agent_commissions (agent_id, customer_paid_at)
  WHERE status = 'pending'
    AND type IN ('order', 'new_client_bonus')
    AND customer_paid_at IS NOT NULL;

COMMENT ON COLUMN public.agent_commissions.customer_paid_at IS
  'Phase 19b. Timestamp when the customer paid this order. NULL = '
  'still awaiting customer payment (commission is provisional). '
  'Set when admin ticks the "Customer paid" checkbox in Commission '
  'History; cleared on un-tick. Drives the monthly export (only rows '
  'with this set are exported).';

-- ─── Verification (optional, run after) ──────────────────────────────
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='agent_commissions'
--   AND column_name='customer_paid_at';
--
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname='public' AND indexname='idx_agent_commissions_ready_to_pay';
