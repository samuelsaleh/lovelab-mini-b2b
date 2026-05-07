-- =====================================================================
-- Phase 19c — Heal missing agent_commissions rows for legacy orders
-- =====================================================================
-- Some orders predate the commission hook (or were saved while attribution
-- was failing), so they have no row in agent_commissions even though they
-- should. Sam's screenshot of Nicolas shows the yellow "Estimated from
-- order documents" banner for exactly this reason — the page falls back
-- to computing commissions from documents because the table is empty.
--
-- This script back-fills the missing rows using the same three-tier
-- attribution logic as lib/commissionAttribution.js:
--   Tier 1  → document creator is themselves an active agent
--   Tier 2  → event has organization_id with an active agent inside
--   Tier 3  → event creator is an active agent
--
-- For each non-deleted order document with no commission row yet,
-- attributes it to the first matching tier and inserts a pending row.
--
-- SAFETY:
--   - Idempotent. Re-running creates no duplicates (ON CONFLICT DO NOTHING
--     against the partial unique index agent_commissions_agent_document_unique).
--   - Skips internal / consignment / delete_from_stock orders.
--   - Skips orders with total_amount <= 0.
--   - Skips agents whose effective rate (profile rate, falling back to org
--     rate) is 0 — no point creating a 0€ commission row.
--   - Does NOT deduct shipping. Old orders rarely have reliable shipping
--     metadata; the commission_amount uses the gross total_amount.
--     Going forward, the commission hook deducts shipping correctly.
--
-- Run AFTER the Phase 19, 19-fix, and 19b migrations are applied.
-- =====================================================================

WITH order_attribution AS (
  SELECT
    d.id AS document_id,
    d.total_amount,
    d.created_at,
    COALESCE(
      -- Tier 1: creator is themselves an active agent
      (SELECT p.id FROM profiles p
        WHERE p.id = d.created_by
          AND p.is_agent = true
          AND p.agent_status = 'active'
          AND p.agent_deleted_at IS NULL
        LIMIT 1),
      -- Tier 2: any active agent attached to the event's organization
      (SELECT p.id FROM events e
        JOIN profiles p ON p.organization_id = e.organization_id
        WHERE e.id = d.event_id
          AND e.organization_id IS NOT NULL
          AND p.is_agent = true
          AND p.agent_status = 'active'
          AND p.agent_deleted_at IS NULL
        LIMIT 1),
      -- Tier 3: event creator is an active agent (different from doc creator)
      (SELECT p.id FROM events e
        JOIN profiles p ON p.id = e.created_by
        WHERE e.id = d.event_id
          AND p.is_agent = true
          AND p.agent_status = 'active'
          AND p.agent_deleted_at IS NULL
          AND p.id IS DISTINCT FROM d.created_by
        LIMIT 1)
    ) AS agent_id
  FROM documents d
  WHERE d.document_type = 'order'
    AND d.deleted_at IS NULL
    AND d.order_channel NOT IN ('internal', 'consignment', 'delete_from_stock')
    AND COALESCE(d.total_amount, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM agent_commissions ac
      WHERE ac.document_id = d.id
    )
)
INSERT INTO agent_commissions (
  agent_id,
  document_id,
  type,
  order_total,
  commission_rate,
  commission_amount,
  status,
  created_at
)
SELECT
  oa.agent_id,
  oa.document_id,
  'order',
  oa.total_amount,
  COALESCE(NULLIF(p.commission_rate, 0), o.commission_rate, 0) AS effective_rate,
  ROUND(
    oa.total_amount * COALESCE(NULLIF(p.commission_rate, 0), o.commission_rate, 0) / 100,
    2
  ) AS effective_amount,
  'pending',
  oa.created_at
FROM order_attribution oa
JOIN profiles p ON p.id = oa.agent_id
LEFT JOIN organizations o ON o.id = p.organization_id
WHERE oa.agent_id IS NOT NULL
  AND COALESCE(NULLIF(p.commission_rate, 0), o.commission_rate, 0) > 0
ON CONFLICT (agent_id, document_id)
  WHERE document_id IS NOT NULL
  DO NOTHING;

-- ─── Verification (optional, run after) ──────────────────────────────
-- See how many rows were healed for Nicolas:
--
-- SELECT ac.type, ac.status, ac.commission_rate, ac.commission_amount,
--        ac.order_total, d.client_company, ac.created_at
-- FROM agent_commissions ac
-- LEFT JOIN documents d ON d.id = ac.document_id
-- WHERE ac.agent_id IN (SELECT id FROM profiles WHERE full_name ILIKE '%nicolas%')
-- ORDER BY ac.created_at DESC;
--
-- See orders that COULD NOT be healed (no resolvable agent or rate=0):
--
-- SELECT d.id, d.client_company, d.total_amount, d.created_by, d.event_id,
--        d.order_channel
-- FROM documents d
-- WHERE d.document_type = 'order'
--   AND d.deleted_at IS NULL
--   AND d.order_channel NOT IN ('internal', 'consignment', 'delete_from_stock')
--   AND COALESCE(d.total_amount, 0) > 0
--   AND NOT EXISTS (SELECT 1 FROM agent_commissions ac WHERE ac.document_id = d.id);
