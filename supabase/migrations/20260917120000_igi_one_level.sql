-- One level on IGI's stock, and IGI can see it (Sam, 16 Sept 2026).
--
-- Until now there were two levels on the same stock: LoveLab's order_min,
-- hidden from IGI as "their judgement of IGI", and IGI's own pool_min, which
-- IGI set for themselves as "warn me below". LoveLab's father had set the
-- first on 47 models; nobody had ever set the second, and IGI have no login
-- yet. So when a model fell below what LoveLab need IGI to hold, nobody at
-- IGI was told.
--
-- Sam: "Don't they need to be warned below what we always want them to
-- have?" Yes. LoveLab are the customer; the minimum IGI must hold is
-- LoveLab's decision, and IGI's job is to see it. From now on order_min is
-- the one level. IGI read it (their stock screen shows it beside what they
-- hold, their To do lists every model below it), and they no longer keep a
-- level of their own.
--
-- pool_min stays as a column, empty. Dropping it buys nothing and cannot be
-- undone; the app simply stops reading it.

-- ─── 1. What IGI may read: the level LoveLab want them to hold ─────────────
-- Row level security cannot hide a column, only a row, so the SELECT grant is
-- the wall. shelf_min stays behind it (it hints at how fast the shelf
-- empties); order_min crosses it; pool_min leaves the list.
REVOKE SELECT ON public.igi_models FROM authenticated;
GRANT SELECT (
  id, serial, serial_full, name, igi_name, stones, carat, shape, spec,
  state, qty_ordered, order_min, sort_order, created_at, updated_at
) ON public.igi_models TO authenticated;

-- ─── 2. What IGI may write: no level at all any more ───────────────────────
-- Numbering a new model stays theirs; the "IGI can number a new model" policy
-- from 20260910120000 is untouched. The alert-level policy goes, and pool_min
-- leaves the UPDATE grant.
DROP POLICY IF EXISTS "IGI can set their own alert level" ON public.igi_models;

REVOKE UPDATE ON public.igi_models FROM authenticated;
GRANT UPDATE (serial, serial_full, state, numbered_by, numbered_at)
  ON public.igi_models TO authenticated;

-- ─── 3. Say so on the columns ──────────────────────────────────────────────
COMMENT ON COLUMN public.igi_models.order_min IS
  'LoveLab''s level on IGI''s stock, and the one level there is. IGI see it as the minimum they must hold; below it, their To do says Produce more and both companies are emailed.';
COMMENT ON COLUMN public.igi_models.pool_min IS
  'Retired 17 Sept 2026, kept empty. IGI''s separate "warn me below" level was never set; order_min is the one level.';
