-- Backfill events.organization_id for legacy agent-type folders that were
-- created before the auto-link logic in /api/events POST. Without
-- organization_id set, the Fairs page can't enrich the folder with the
-- agent's real order totals — it falls back to "documents tagged to this
-- folder" counts, which is what produced the 5-orders-vs-30-orders gap
-- on Nicolas Wholesale France.
--
-- Idempotent: only updates rows where organization_id IS NULL, and only
-- when EXACTLY one matching agent profile is found (avoids cross-wiring
-- two people with the same display name into one folder — mirrors the
-- safety check in the POST handler).
--
-- Safe to re-run.

WITH candidates AS (
  SELECT
    e.id AS event_id,
    (
      SELECT p.organization_id
      FROM public.profiles p
      WHERE p.organization_id IS NOT NULL
        AND p.agent_deleted_at IS NULL
        AND (p.is_agent = true OR p.agent_status IN ('invited','active','inactive'))
        AND lower(trim(p.full_name)) = lower(trim(e.name))
      LIMIT 2
    ) AS resolved_org_id,
    (
      SELECT count(*)
      FROM public.profiles p
      WHERE p.organization_id IS NOT NULL
        AND p.agent_deleted_at IS NULL
        AND (p.is_agent = true OR p.agent_status IN ('invited','active','inactive'))
        AND lower(trim(p.full_name)) = lower(trim(e.name))
    ) AS match_count
  FROM public.events e
  WHERE e.type = 'agent'
    AND e.organization_id IS NULL
)
UPDATE public.events e
SET organization_id = c.resolved_org_id
FROM candidates c
WHERE e.id = c.event_id
  AND c.match_count = 1
  AND c.resolved_org_id IS NOT NULL;

-- Dry-run companion query — run BEFORE the UPDATE to preview matches.
-- Comment out the UPDATE above and run this on its own first:
--
-- SELECT e.id, e.name, c.resolved_org_id, c.match_count
-- FROM public.events e
-- LEFT JOIN candidates c ON c.event_id = e.id
-- WHERE e.type = 'agent' AND e.organization_id IS NULL
-- ORDER BY e.name;
