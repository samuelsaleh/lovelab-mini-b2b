-- Phase 20: Custom Packs
-- ────────────────────────────────────────────────────────────────────────────
-- Replaces the four legacy hardcoded packs in app/components/BuilderPage.jsx
-- with a database-backed `packs` table so admins can publish global packs
-- visible to everyone and agents can save private packs visible only to
-- themselves. Run this migration in the Supabase SQL editor.
--
-- Visibility rules (also enforced via RLS below):
--   - scope = 'global'  → readable by everyone, writable by admins.
--   - scope = 'private' → readable AND writable only by the owner. Strictly
--                          invisible to other agents AND to admins.
--
-- Pricing rule:
--   - fixed_total >= 970 (€) for both global and private packs.
--
-- Seeding:
--   - The four legacy hardcoded packs (Pack 1..4) are inserted as
--     `is_seed = true`, `scope = 'global'`, `created_by = NULL`. Seed packs
--     are undeletable (the delete policy filters them out) so users keep
--     seeing the same starting set after the migration.

-- ────────────────────────────────────────────────────────────
-- Table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.packs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL,
  description   text[] DEFAULT '{}',
  budget_label  text,
  fixed_total   numeric(10,2) NOT NULL CHECK (fixed_total >= 970),
  form_rows     jsonb NOT NULL,
  scope         text NOT NULL CHECK (scope IN ('global', 'private')),
  created_by    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_seed       boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS packs_scope_idx       ON public.packs(scope);
CREATE INDEX IF NOT EXISTS packs_created_by_idx  ON public.packs(created_by);

-- ────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.packs ENABLE ROW LEVEL SECURITY;

-- SELECT: a row is visible if it's a global pack OR the caller owns it.
--   - Admins see global packs and their OWN private packs only — they CANNOT
--     see other users' private packs (this is intentional and locked).
DROP POLICY IF EXISTS packs_select ON public.packs;
CREATE POLICY packs_select ON public.packs
  FOR SELECT
  USING (
    scope = 'global'
    OR created_by = auth.uid()
  );

-- INSERT: agents can only insert private packs they own. Admins can insert
-- either global or private packs (the role check uses public.is_admin()).
DROP POLICY IF EXISTS packs_insert ON public.packs;
CREATE POLICY packs_insert ON public.packs
  FOR INSERT
  WITH CHECK (
    (scope = 'private' AND created_by = auth.uid())
    OR (scope = 'global' AND public.is_admin())
  );

-- UPDATE: owners can update their packs; admins can update any global pack.
DROP POLICY IF EXISTS packs_update ON public.packs;
CREATE POLICY packs_update ON public.packs
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR (scope = 'global' AND public.is_admin())
  )
  WITH CHECK (
    created_by = auth.uid()
    OR (scope = 'global' AND public.is_admin())
  );

-- DELETE: same as UPDATE BUT seed packs are undeletable.
DROP POLICY IF EXISTS packs_delete ON public.packs;
CREATE POLICY packs_delete ON public.packs
  FOR DELETE
  USING (
    is_seed = false
    AND (
      created_by = auth.uid()
      OR (scope = 'global' AND public.is_admin())
    )
  );

-- ────────────────────────────────────────────────────────────
-- updated_at trigger
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_packs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS packs_updated_at ON public.packs;
CREATE TRIGGER packs_updated_at
  BEFORE UPDATE ON public.packs
  FOR EACH ROW EXECUTE FUNCTION public.set_packs_updated_at();

-- ────────────────────────────────────────────────────────────
-- Seed: the four legacy hardcoded packs
-- ────────────────────────────────────────────────────────────
-- These mirror PACK1_ROWS..PACK4_ROWS in app/components/BuilderPage.jsx so
-- nothing visually disappears for users after the migration. They are
-- inserted with is_seed = true so the delete policy blocks them.
--
-- We use ON CONFLICT DO NOTHING with a deterministic label-based guard so
-- re-running the migration is safe.

INSERT INTO public.packs (label, description, budget_label, fixed_total, form_rows, scope, created_by, is_seed)
SELECT 'Pack 1',
       ARRAY[
         'SHAPY SHINE FANCY — 0.10 ct, Bezel, 5 shapes',
         'MULTI FIVE — 0.25 & 0.50 ct',
         'MULTI FOUR — 0.20 & 0.40 ct'
       ],
       '€55 – €130/bracelet',
       970,
       '[
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Heart","bpColor":"Yellow","setting":"Bezel","size":"","colorCord":"Bordeaux","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Heart","bpColor":"White","setting":"Bezel","size":"","colorCord":"Gold","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Pear","bpColor":"Yellow","setting":"Bezel","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Pear","bpColor":"White","setting":"Bezel","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Marquise","bpColor":"White","setting":"Bezel","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Marquise","bpColor":"White","setting":"Bezel","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Oval","bpColor":"Yellow","setting":"Bezel","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Oval","bpColor":"Yellow","setting":"Bezel","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Emerald","bpColor":"Yellow","setting":"Bezel","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Emerald","bpColor":"Yellow","setting":"Bezel","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"MULTI FIVE","carat":"0.25","bpColor":"White","setting":"","size":"M","colorCord":"Red","quantity":"1","unitPrice":"95","shape":"","cert":"IGI"},
         {"collection":"MULTI FIVE","carat":"0.50","bpColor":"Yellow","setting":"","size":"M","colorCord":"Black","quantity":"1","unitPrice":"130","shape":"","cert":"IGI"},
         {"collection":"MULTI FOUR","carat":"0.20","bpColor":"White","setting":"","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"85","shape":"","cert":"IGI"},
         {"collection":"MULTI FOUR","carat":"0.40","bpColor":"Yellow","setting":"","size":"M","colorCord":"Black","quantity":"1","unitPrice":"110","shape":"","cert":"IGI"}
       ]'::jsonb,
       'global',
       NULL,
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.packs WHERE is_seed = true AND label = 'Pack 1'
);

INSERT INTO public.packs (label, description, budget_label, fixed_total, form_rows, scope, created_by, is_seed)
SELECT 'Pack 2',
       ARRAY[
         'SHAPY SHINE FANCY — 0.30 & 0.50 ct, 5 shapes',
         'MATCHY FANCY — 0.60 & 1.00 ct, 3 shapes'
       ],
       '€100 – €310/bracelet',
       1520,
       '[
         {"collection":"SHAPY SHINE FANCY","carat":"0.30","shape":"Marquise","bpColor":"White","setting":"Prong","size":"M","colorCord":"Red","quantity":"1","unitPrice":"100","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.30","shape":"Pear","bpColor":"White","setting":"Prong","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"100","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.30","shape":"Oval","bpColor":"Yellow","setting":"Prong","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"100","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.50","shape":"Emerald","bpColor":"White","setting":"Bezel","size":"M","colorCord":"Black","quantity":"1","unitPrice":"155","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.30","shape":"Heart","bpColor":"White","setting":"Bezel","size":"M","colorCord":"Red","quantity":"1","unitPrice":"100","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.50","shape":"Heart","bpColor":"Yellow","setting":"Bezel","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"155","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.30","shape":"Emerald","bpColor":"White","setting":"Bezel","size":"M","colorCord":"Black","quantity":"1","unitPrice":"100","cert":"IGI"},
         {"collection":"MATCHY FANCY","carat":"0.60","shape":"Emerald","bpColor":"White","setting":"Prong","size":"M","colorCord":"Black","quantity":"1","unitPrice":"200","cert":"IGI"},
         {"collection":"MATCHY FANCY","carat":"1.00","shape":"Pear","bpColor":"YY","setting":"Prong","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"310","cert":"IGI"},
         {"collection":"MATCHY FANCY","carat":"0.60","shape":"Heart","bpColor":"WY","setting":"Bezel","size":"M","colorCord":"Red","quantity":"1","unitPrice":"200","cert":"IGI"}
       ]'::jsonb,
       'global',
       NULL,
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.packs WHERE is_seed = true AND label = 'Pack 2'
);

-- Pack 3: full row list mirrors PACK3_ROWS in BuilderPage.jsx including the
-- expanded 20 nylon CUTY rows and the curated 8-color CUTY/CUBIX subsets.
INSERT INTO public.packs (label, description, budget_label, fixed_total, form_rows, scope, created_by, is_seed)
SELECT 'Pack 3',
       ARRAY[
         'CUTY — 0.05 & 0.10 ct, size M (In-house)',
         'CUBIX — 0.05 & 0.10 ct, size S/M (In-house)',
         'MULTI THREE — 0.15 & 0.30 ct, mixed housing, size M (IGI)'
       ],
       '€24 – €95/bracelet',
       1856,
       '[
         {"collection":"CUTY","carat":"0.05","bpColor":"White","size":"M","colorCord":"Black","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","size":"M","colorCord":"White","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","size":"M","colorCord":"Red","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","size":"M","colorCord":"Light Pink","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","size":"M","colorCord":"Dark Pink","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","size":"M","colorCord":"Navy Blue","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","size":"M","colorCord":"Lilac","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","size":"M","colorCord":"Silver Grey","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","size":"M","colorCord":"Red","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","size":"M","colorCord":"Dark Pink","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","size":"M","colorCord":"Navy Blue","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","size":"M","colorCord":"Lilac","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","size":"M","colorCord":"Black","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","size":"M","colorCord":"Silver Grey","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","size":"S/M","colorCord":"Bordeaux","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","size":"S/M","colorCord":"Dark Pink","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","size":"S/M","colorCord":"Gold","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","size":"S/M","colorCord":"Navy Blue","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","size":"S/M","colorCord":"Lilac","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","size":"S/M","colorCord":"Black","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","size":"S/M","colorCord":"Silver Grey","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","size":"S/M","colorCord":"Red","quantity":"1","unitPrice":"24","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","size":"S/M","colorCord":"Bordeaux","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","size":"S/M","colorCord":"Light Pink","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","size":"S/M","colorCord":"Gold","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","size":"S/M","colorCord":"Navy Blue","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","size":"S/M","colorCord":"Lilac","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","size":"S/M","colorCord":"Black","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","size":"S/M","colorCord":"Silver Grey","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","size":"S/M","colorCord":"Red","quantity":"1","unitPrice":"34","shape":"","setting":"","cert":"In-house"},
         {"collection":"MULTI THREE","carat":"0.15","bpColor":"YYY","setting":"F","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"65","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.15","bpColor":"YWP","setting":"LO","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"65","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.15","bpColor":"PPP","setting":"F","size":"M","colorCord":"Black","quantity":"1","unitPrice":"65","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.15","bpColor":"WWW","setting":"F","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"65","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.30","bpColor":"YYY","setting":"F","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"95","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.30","bpColor":"YWP","setting":"LO","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"95","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.30","bpColor":"WWW","setting":"F","size":"M","colorCord":"Black","quantity":"1","unitPrice":"95","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.30","bpColor":"WWW","setting":"LO","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"95","shape":"","cert":"IGI"}
       ]'::jsonb,
       'global',
       NULL,
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.packs WHERE is_seed = true AND label = 'Pack 3'
);

INSERT INTO public.packs (label, description, budget_label, fixed_total, form_rows, scope, created_by, is_seed)
SELECT 'Pack 4',
       ARRAY[
         'SHAPY SHINE FANCY — 0.10 ct Bezel + 0.30 ct Prong, 5 shapes',
         'MULTI FOUR — 0.20 ct',
         'MULTI THREE — 0.15 ct, mixed housing',
         'CUBIX — 0.05 & 0.10 ct, size S/M',
         'CUTY — 0.05 & 0.10 ct, size M'
       ],
       '€30 – €100/bracelet',
       1800,
       '[
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Heart","bpColor":"Yellow","setting":"Bezel","size":"M","colorCord":"Silver Grey","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Pear","bpColor":"Yellow","setting":"Bezel","size":"M","colorCord":"Red","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Marquise","bpColor":"White","setting":"Bezel","size":"M","colorCord":"Navy Blue","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Emerald","bpColor":"Yellow","setting":"Bezel","size":"M","colorCord":"Black","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.10","shape":"Oval","bpColor":"White","setting":"Bezel","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"55","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.30","shape":"Oval","bpColor":"White","setting":"Prong","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"100","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.30","shape":"Emerald","bpColor":"Yellow","setting":"Prong","size":"M","colorCord":"Lilac","quantity":"1","unitPrice":"100","cert":"IGI"},
         {"collection":"SHAPY SHINE FANCY","carat":"0.30","shape":"Pear","bpColor":"White","setting":"Prong","size":"M","colorCord":"Light Pink","quantity":"1","unitPrice":"100","cert":"IGI"},
         {"collection":"MULTI FOUR","carat":"0.20","bpColor":"White","setting":"","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"85","shape":"","cert":"IGI"},
         {"collection":"MULTI FOUR","carat":"0.20","bpColor":"Yellow","setting":"","size":"M","colorCord":"Black","quantity":"1","unitPrice":"85","shape":"","cert":"IGI"},
         {"collection":"MULTI FOUR","carat":"0.20","bpColor":"Yellow","setting":"","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"85","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.15","bpColor":"","setting":"LO","size":"","colorCord":"Gold","quantity":"1","unitPrice":"65","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.15","bpColor":"WWW","setting":"F","size":"","colorCord":"Black","quantity":"1","unitPrice":"65","shape":"","cert":"IGI"},
         {"collection":"MULTI THREE","carat":"0.15","bpColor":"YYY","setting":"F","size":"","colorCord":"Bordeaux","quantity":"1","unitPrice":"65","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"Yellow","setting":"","size":"S/M","colorCord":"Red","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"Yellow","setting":"","size":"S/M","colorCord":"Bordeaux","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","setting":"","size":"S/M","colorCord":"Gold","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","setting":"","size":"S/M","colorCord":"Black","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"Yellow","setting":"","size":"S/M","colorCord":"Silver Grey","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.05","bpColor":"White","setting":"","size":"S/M","colorCord":"Navy Blue","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","setting":"","size":"S/M","colorCord":"Red","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","setting":"","size":"S/M","colorCord":"Bordeaux","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"White","setting":"","size":"S/M","colorCord":"Gold","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"White","setting":"","size":"S/M","colorCord":"Black","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"Yellow","setting":"","size":"S/M","colorCord":"Silver Grey","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"},
         {"collection":"CUBIX","carat":"0.10","bpColor":"White","setting":"","size":"S/M","colorCord":"Navy Blue","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","setting":"","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.05","bpColor":"Yellow","setting":"","size":"M","colorCord":"Silver Grey","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","setting":"","size":"M","colorCord":"Black","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.05","bpColor":"White","setting":"","size":"M","colorCord":"Navy Blue","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.05","bpColor":"Yellow","setting":"","size":"M","colorCord":"Red","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.05","bpColor":"Yellow","setting":"","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"30","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.10","bpColor":"White","setting":"","size":"M","colorCord":"Gold","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","setting":"","size":"M","colorCord":"Silver Grey","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.10","bpColor":"White","setting":"","size":"M","colorCord":"Black","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.10","bpColor":"White","setting":"","size":"M","colorCord":"Navy Blue","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","setting":"","size":"M","colorCord":"Red","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"},
         {"collection":"CUTY","carat":"0.10","bpColor":"Yellow","setting":"","size":"M","colorCord":"Bordeaux","quantity":"1","unitPrice":"40","shape":"","cert":"IGI"}
       ]'::jsonb,
       'global',
       NULL,
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.packs WHERE is_seed = true AND label = 'Pack 4'
);
