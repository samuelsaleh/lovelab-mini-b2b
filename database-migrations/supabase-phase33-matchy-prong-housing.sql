-- Phase 33 — MATCHY prong housing pairs
--
-- MATCHY FANCY carries two diamonds, so its prong housing can mix metals just
-- like the bezel setting. The app now offers White / Yellow / Pink plus the
-- mixed pairs WY / WP / YP under Prong (lib/catalog.js HOUSING.matchyProng).
--
-- Legacy pack sheets wrote prong same-metal pairs with the bezel-style codes
-- (WW / YY / PP) — e.g. the seed "Pack 2" has a MATCHY FANCY row with
-- setting "Prong" + bpColor "YY". Those codes are not valid prong options in
-- the builder (the housing dropdown rendered blank), so normalize them to the
-- catalog's prong names (White / Yellow / Pink) in every stored pack.
--
-- Run this in the Supabase SQL editor. Idempotent: re-running is a no-op.

UPDATE public.packs
SET form_rows = (
  SELECT jsonb_agg(
    CASE
      WHEN row->>'collection' ILIKE '%MATCHY%'
       AND row->>'setting' = 'Prong'
       AND row->>'bpColor' IN ('WW', 'YY', 'PP')
      THEN jsonb_set(
        row,
        '{bpColor}',
        to_jsonb(
          CASE row->>'bpColor'
            WHEN 'WW' THEN 'White'
            WHEN 'YY' THEN 'Yellow'
            WHEN 'PP' THEN 'Pink'
          END
        )
      )
      ELSE row
    END
  )
  FROM jsonb_array_elements(form_rows) AS row
)
WHERE form_rows IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(form_rows) AS row
    WHERE row->>'collection' ILIKE '%MATCHY%'
      AND row->>'setting' = 'Prong'
      AND row->>'bpColor' IN ('WW', 'YY', 'PP')
  );
