-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Pack sort order + admin delete of every pack type
-- Date: 2026-07-30
-- Purpose:
--   1. Add packs.sort_order so admins can drag-reorder the Builder pack strip
--      permanently for everyone (today order is is_seed + created_at only).
--   2. Let admins DELETE any pack — including seeds and other users' private
--      packs — matching Sam's "admins can delete all types of packs" request.
--      Agents keep the previous rule: only their own non-seed packs.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Column
ALTER TABLE public.packs
  ADD COLUMN IF NOT EXISTS sort_order integer;

-- 2. Backfill from the current listing order (seeds first, then created_at).
--    Idempotent: only fills rows that still have NULL.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           ORDER BY is_seed DESC, created_at ASC NULLS LAST, id ASC
         ) - 1 AS rn
  FROM public.packs
)
UPDATE public.packs p
SET sort_order = ranked.rn
FROM ranked
WHERE p.id = ranked.id
  AND p.sort_order IS NULL;

-- 3. Default for brand-new packs: append at the end.
--    (Application also sets an explicit value; this is a backstop.)
ALTER TABLE public.packs
  ALTER COLUMN sort_order SET DEFAULT 1000000;

CREATE INDEX IF NOT EXISTS idx_packs_sort_order
  ON public.packs(sort_order ASC NULLS LAST);

-- 4. DELETE policy: admins can delete ANY pack (seed + every scope).
--    Non-admins still only delete their own non-seed packs.
DROP POLICY IF EXISTS packs_delete ON public.packs;
CREATE POLICY packs_delete ON public.packs
  FOR DELETE
  USING (
    public.is_admin()
    OR (
      is_seed = false
      AND created_by = auth.uid()
    )
  );

-- 5. UPDATE policy: admins can update ANY pack (needed for sort_order
--    writes on seeds / others' private packs when the user-context client
--    is used). Owners keep edit on their own packs.
DROP POLICY IF EXISTS packs_update ON public.packs;
CREATE POLICY packs_update ON public.packs
  FOR UPDATE
  USING (
    public.is_admin()
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.is_admin()
    OR created_by = auth.uid()
  );
