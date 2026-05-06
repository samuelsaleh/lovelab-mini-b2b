-- =====================================================================
-- Phase 18 — Marc Schlund (and friends) "deleted order still counted"
-- diagnostic. READ-ONLY, run in Supabase SQL editor.
-- =====================================================================
-- Purpose:
--   The admin Top Agents widget kept showing "Marc Schlund: 1 order, €470"
--   even after the order was deleted. The JS fix in /api/agents/route.js
--   stops counting cancelled commission rows, but the same widget also
--   reads from the public.get_agent_stats() RPC. If THAT function also
--   counts cancelled commissions, the JS fix won't be enough.
--
--   Run all 3 queries below and paste the results back. They will tell us
--   whether (a) Marc's commission row really is cancelled, (b) the RPC
--   ignores cancelled rows or not, (c) the RPC counts deleted documents.
-- =====================================================================

-- 1) Find Marc's profile + every commission row pointing at him.
--    Expected: at least one row with status='cancelled' if Phase 11b ran.
SELECT
  p.id                   AS agent_id,
  p.full_name,
  p.email,
  c.id                   AS commission_id,
  c.document_id,
  c.type,
  c.status,
  c.order_total,
  c.commission_amount,
  c.created_at,
  c.notes,
  d.deleted_at           AS document_deleted_at,
  d.client_name          AS document_client_name
FROM public.profiles p
LEFT JOIN public.agent_commissions c ON c.agent_id = p.id
LEFT JOIN public.documents d         ON d.id      = c.document_id
WHERE p.full_name ILIKE '%marc%schlund%'
   OR p.email     ILIKE '%marc%';


-- 2) Inspect the live get_agent_stats() function definition.
--    If it does not filter on status != 'cancelled' or deleted_at IS NULL
--    we'll need to replace it. Function source isn't in any migration in
--    the repo — production was patched manually at some point.
SELECT
  n.nspname              AS schema,
  p.proname              AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid)    AS return_type,
  pg_get_functiondef(p.oid)        AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_agent_stats';


-- 3) Call the RPC and show what it returns for Marc TODAY.
--    If total_orders > 0 here, the RPC is the bug source and we'll need
--    a CREATE OR REPLACE FUNCTION migration to fix it.
WITH marc AS (
  SELECT id FROM public.profiles
  WHERE full_name ILIKE '%marc%schlund%' OR email ILIKE '%marc%'
  LIMIT 1
)
SELECT s.*
FROM public.get_agent_stats() s, marc
WHERE s.agent_id = marc.id;
