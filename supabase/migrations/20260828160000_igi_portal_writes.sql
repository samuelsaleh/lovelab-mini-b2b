-- What IGI may write, and the one thing they must never write.
--
-- Phase 1 gave IGI read access to the models they produce, the movements sent
-- to them and their own batches. This adds the three writes their portal needs,
-- each narrowed to a single column where row level security alone cannot do it.

-- ─── 1. Recording what they produced ────────────────────────────────────────
-- The one transition IGI may perform: a movement waiting on them becomes one
-- that is ready to receive. They cannot cancel it, receive it, or reopen it.

DROP POLICY IF EXISTS "IGI can record what they made" ON public.igi_visits;
CREATE POLICY "IGI can record what they made" ON public.igi_visits
  FOR UPDATE TO authenticated
  USING (public.is_igi() AND status = 'requested')
  WITH CHECK (public.is_igi() AND status = 'issued');

DROP POLICY IF EXISTS "IGI can set the quantity made" ON public.igi_visit_lines;
CREATE POLICY "IGI can set the quantity made" ON public.igi_visit_lines
  FOR UPDATE TO authenticated
  USING (public.is_igi() AND EXISTS (
    SELECT 1 FROM public.igi_visits v
     WHERE v.id = visit_id AND v.status = 'requested'))
  WITH CHECK (public.is_igi());

-- Row level security decides which ROWS may be updated, never which COLUMNS.
-- Without the grant below, the policy above would also let IGI rewrite
-- qty_requested — that is, quietly change what LoveLab asked for.
REVOKE UPDATE ON public.igi_visit_lines FROM authenticated;
GRANT UPDATE (qty_issued) ON public.igi_visit_lines TO authenticated;

-- ─── 2. Their own alert level ───────────────────────────────────────────────
-- Two alert rules, one owner each. pool_min is IGI's, on their own stock.
-- shelf_min is LoveLab's and is not even readable here (see the 20260828120000
-- migration), let alone writable.

DROP POLICY IF EXISTS "IGI can set their own alert level" ON public.igi_models;
CREATE POLICY "IGI can set their own alert level" ON public.igi_models
  FOR UPDATE TO authenticated
  USING (public.is_igi() AND state = 'in_use')
  WITH CHECK (public.is_igi());

REVOKE UPDATE ON public.igi_models FROM authenticated;
GRANT UPDATE (pool_min) ON public.igi_models TO authenticated;

-- ─── 3. Closing a door that was already open ────────────────────────────────
-- Not an IGI change, but it is what makes every IGI rule above hold.
--
-- The profiles policy is FOR UPDATE USING (auth.uid() = id) with no column
-- restriction, so any signed-in account could rewrite its own row through the
-- public API — including `role`, and now `is_igi`. An IGI account could
-- therefore clear its own flag and walk straight past the containment in
-- lib/supabase/middleware.js; an agent could make themselves an admin.
--
-- Nothing in the application writes to profiles through the RLS-scoped client
-- (every path uses the service role, which is unaffected by grants), so
-- withdrawing this changes no behaviour and removes the escalation.

REVOKE UPDATE ON public.profiles FROM authenticated;
