-- Phase 30: Report payment safety guards
-- ────────────────────────────────────────────────────────────────────────────
-- A commission report represents one payable bundle. It must not be linked to
-- more than one agent_payments row, even if two admins submit stale forms at the
-- same time. NULL report_id is still allowed for free-form/manual payments.

CREATE UNIQUE INDEX IF NOT EXISTS agent_payments_report_id_unique
  ON public.agent_payments (report_id)
  WHERE report_id IS NOT NULL;

-- Verification (optional):
-- SELECT report_id, count(*)
-- FROM public.agent_payments
-- WHERE report_id IS NOT NULL
-- GROUP BY report_id
-- HAVING count(*) > 1;
