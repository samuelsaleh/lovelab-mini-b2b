-- Phase 25: Cyclic rename of seed packs + chronological ordering.
--
-- Per Sam's request:
--   old "Pack 3" (CUTY/CUBIX/MULTI THREE) -> "Pack 1"
--   old "Pack 1" (SHAPY 0.10)             -> "Pack 2"
--   old "Pack 2" (SHAPY 0.30 & 0.50)      -> "Pack 3"
--   "Pack 4" / "PACK 6-RB-SYN"            -> unchanged
--
-- Idempotent: the rename only fires while still in the OLD state (detected by
-- "Pack 1" being the SHAPY pack). Re-running after the rename is a no-op.
-- Safe to run multiple times.

DO $$
DECLARE
  pack1_is_shapy boolean;
BEGIN
  SELECT (description->>0) LIKE 'SHAPY%'
    INTO pack1_is_shapy
  FROM packs
  WHERE is_seed = true AND label = 'Pack 1'
  LIMIT 1;

  IF COALESCE(pack1_is_shapy, false) THEN
    -- Use a temporary sentinel to avoid label collisions mid-permutation.
    UPDATE packs SET label = '__tmp_pack_3' WHERE is_seed = true AND label = 'Pack 3';
    UPDATE packs SET label = 'Pack 3'       WHERE is_seed = true AND label = 'Pack 2';
    UPDATE packs SET label = 'Pack 2'       WHERE is_seed = true AND label = 'Pack 1';
    UPDATE packs SET label = 'Pack 1'       WHERE is_seed = true AND label = '__tmp_pack_3';
    RAISE NOTICE 'Packs renamed (3->1, 1->2, 2->3).';
  ELSE
    RAISE NOTICE 'Rename already applied — skipping.';
  END IF;
END $$;

-- Chronological order so seeds list Pack 1..4 (then Pack 6 keeps its later
-- timestamp and trails Pack 4). Idempotent.
UPDATE packs SET created_at = '2025-01-01T00:00:01Z' WHERE is_seed = true AND label = 'Pack 1';
UPDATE packs SET created_at = '2025-01-01T00:00:02Z' WHERE is_seed = true AND label = 'Pack 2';
UPDATE packs SET created_at = '2025-01-01T00:00:03Z' WHERE is_seed = true AND label = 'Pack 3';
UPDATE packs SET created_at = '2025-01-01T00:00:04Z' WHERE is_seed = true AND label = 'Pack 4';
