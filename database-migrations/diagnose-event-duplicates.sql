-- =====================================================================
-- Phase 13 — Event duplicate diagnostic (READ-ONLY)
-- =====================================================================
-- Purpose:  Show every group of agent-type events that share the same
--           (case-insensitive, trimmed) name within the same organisation.
--           These are the rows that would conflict with the unique index
--           added by supabase-phase17-event-dedup.sql.
--
-- How to use:
--   1. Run this in the Supabase SQL editor.
--   2. If 0 rows are returned -> safe to apply phase17.
--   3. If rows are returned   -> for each group, decide which event is
--      "canonical" (usually the one with documents), reassign documents
--      from the duplicates with:
--          UPDATE public.documents
--             SET event_id = '<canonical-id>'
--           WHERE event_id IN ('<dup-1>', '<dup-2>', ...);
--      then delete the empty duplicates:
--          DELETE FROM public.events WHERE id IN ('<dup-1>', '<dup-2>');
--      and re-run this query until it returns 0 rows.
-- =====================================================================

WITH groups AS (
  SELECT
    LOWER(TRIM(name))                                                  AS norm_name,
    organization_id,
    array_agg(id ORDER BY created_at)                                  AS event_ids,
    array_agg(name ORDER BY created_at)                                AS event_names,
    array_agg(created_at::text ORDER BY created_at)                    AS event_created_at,
    COUNT(*)                                                           AS dup_count
  FROM public.events
  WHERE type = 'agent'
  GROUP BY LOWER(TRIM(name)), organization_id
  HAVING COUNT(*) > 1
)
SELECT
  g.norm_name,
  g.organization_id,
  g.dup_count,
  g.event_ids,
  g.event_names,
  g.event_created_at,
  -- doc count per event id, in the same order as event_ids:
  ARRAY(
    SELECT COUNT(*)::int
    FROM public.documents d
    WHERE d.event_id = ANY(g.event_ids)
      AND d.deleted_at IS NULL
    GROUP BY d.event_id
    ORDER BY ARRAY_POSITION(g.event_ids, d.event_id)
  ) AS doc_counts
FROM groups g
ORDER BY g.dup_count DESC, g.norm_name;
