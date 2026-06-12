-- Phase 29: Payment-driven commission settlement + invoice matching
-- ────────────────────────────────────────────────────────────────────────────
-- Changes the commission lifecycle so a commission only becomes "paid" when the
-- admin records the actual payment (not when the report is emailed):
--
--   Awaiting -> (tick Paid?) -> Ready -> (Send report now) -> Reported
--            -> (Record Payment + invoice) -> Paid
--
-- To support this we link rows to the report that included them:
--   * agent_commissions.report_id  — set when "Send report now" includes the row
--     (replaces the old "mark paid immediately" behaviour). A commission with a
--     report_id but status='pending' is "Reported" (sent, awaiting payment).
--   * agent_payments.report_id     — which report this payout settled.
--   * agent_payments.invoice_number— the invoice mom matched this payout against.
--
-- ON DELETE SET NULL: deleting a report frees its un-paid commissions so they
-- return to "Ready" and can be re-reported. invoice_number on agent_commissions
-- already exists from Phase 28.
--
-- SAFE TO RE-RUN: all guards are IF NOT EXISTS / idempotent.

-- 1. Link a commission to the report that included it.
ALTER TABLE public.agent_commissions
  ADD COLUMN IF NOT EXISTS report_id uuid
    REFERENCES public.commission_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_commissions_report_id
  ON public.agent_commissions (report_id);

-- 2. Link a payout to the report it settled + the matched invoice number.
ALTER TABLE public.agent_payments
  ADD COLUMN IF NOT EXISTS report_id uuid
    REFERENCES public.commission_reports(id) ON DELETE SET NULL;

ALTER TABLE public.agent_payments
  ADD COLUMN IF NOT EXISTS invoice_number text;

CREATE INDEX IF NOT EXISTS idx_agent_payments_report_id
  ON public.agent_payments (report_id);

-- Verification (optional):
-- SELECT id, status, report_id, invoice_number FROM public.agent_commissions LIMIT 5;
-- SELECT id, amount, report_id, invoice_number FROM public.agent_payments LIMIT 5;
