-- Opening shelf stock for Certificate In/Out adjustments.
--
-- On our shelf = shelf_opening + Σ Certificate In − Σ Certificate Out
-- Example: opening 755, In 5, Out 2 → 755 + 5 − 2 = 758.

ALTER TABLE public.igi_models
  ADD COLUMN IF NOT EXISTS shelf_opening integer
    CHECK (shelf_opening IS NULL OR shelf_opening >= 0);

COMMENT ON COLUMN public.igi_models.shelf_opening IS
  'Starting pcs on our shelf before Certificate In/Out. Displayed shelf = shelf_opening + In − Out.';

-- Seed from latest packing-style snapshot (no LGAJ in the description), so
-- existing "On our shelf" figures become the opening base.
UPDATE public.igi_models AS m
SET shelf_opening = s.pcs
FROM (
  SELECT DISTINCT ON (model_id)
    model_id,
    total_pcs AS pcs
  FROM public.igi_shelf_snapshots
  WHERE model_id IS NOT NULL
    AND description !~* 'LGAJ[0-9]+'
  ORDER BY model_id, snapshot_date DESC
) AS s
WHERE m.id = s.model_id
  AND m.shelf_opening IS NULL;
