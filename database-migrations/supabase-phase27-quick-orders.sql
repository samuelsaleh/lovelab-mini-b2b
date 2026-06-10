-- ─────────────────────────────────────────────────────────────────────────
-- Phase 27 — "Quick Orders" (manual order commissions).
--
-- Lets an admin attribute a past sale to an agent by entering just a client
-- name + amount (and optionally a date), WITHOUT creating a full order
-- document. The entry is recorded as an ordinary agent_commissions row with
-- type='order' and document_id=NULL, so it flows through the same
-- pending → customer_paid → paid lifecycle as real orders and appears in the
-- monthly/sent commission report Excel.
--
-- Why a new column:
--   Real order commissions get their customer name from the joined
--   `documents` row (client_company / client_name). A quick order has no
--   document, so there is nowhere to store the name. `client_label` holds it.
--
-- Resilience:
--   - Idempotent: ADD COLUMN IF NOT EXISTS so re-running is harmless.
--   - Nullable: existing rows stay NULL (real orders keep reading the name
--     from their linked document). Only manual quick orders set this.
--   - No type-constraint change needed: 'order' is already an allowed value
--     (see supabase-phase19-new-client-bonus-fix.sql).
--   - The partial unique index agent_commissions_agent_document_unique only
--     applies WHERE document_id IS NOT NULL, so multiple NULL-document quick
--     orders for the same agent never collide.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agent_commissions
  ADD COLUMN IF NOT EXISTS client_label text;

COMMENT ON COLUMN public.agent_commissions.client_label IS
  'Phase 27: Customer name for a manual "quick order" (type=''order'', ' ||
  'document_id IS NULL). NULL for real order commissions, which read the ' ||
  'customer name from their linked documents row instead. Used by ' ||
  'lib/commissionReport.js buildReportData() as the client-name fallback.';
