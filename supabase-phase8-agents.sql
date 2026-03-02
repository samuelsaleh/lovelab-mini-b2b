-- =============================================
-- LoveLab B2B - Phase 8: Agent & Commission System
-- Run this in Supabase SQL Editor AFTER all previous migrations
-- =============================================
-- Adds agent fields to profiles and creates the agent_commissions table
-- for tracking order commissions and manual bonuses.
--
-- SAFE TO RE-RUN: All statements use IF NOT EXISTS or CREATE OR REPLACE.
-- ZERO IMPACT on existing data: All new columns have safe defaults.

-- ─── 1. ADD AGENT COLUMNS TO PROFILES ────────────────────────────────────────
-- All columns are nullable with safe defaults. Existing rows get:
-- is_agent=false, commission_rate=0, everything else NULL.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_agent boolean DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_status text DEFAULT null;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2) DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_since timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_conditions text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_phone text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_company text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_country text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_city text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_region text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_territory text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_specialty text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agent_notes text;

-- Add CHECK constraints (safe -- won't fail on existing rows since defaults satisfy them)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_agent_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_agent_status_check
      CHECK (agent_status IS NULL OR agent_status IN ('invited', 'active', 'paused', 'inactive'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_commission_rate_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_commission_rate_check
      CHECK (commission_rate >= 0 AND commission_rate <= 100);
  END IF;
END $$;

-- ─── 2. CREATE AGENT_COMMISSIONS TABLE ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'order' CHECK (type IN ('order', 'bonus')),
  order_total numeric(12,2) DEFAULT 0,
  commission_rate numeric(5,2) DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Unique constraint: one commission per agent per document (for type='order' only)
-- Bonuses don't have document_id so they won't conflict
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_commissions_agent_document_unique'
  ) THEN
    CREATE UNIQUE INDEX agent_commissions_agent_document_unique
      ON public.agent_commissions (agent_id, document_id)
      WHERE document_id IS NOT NULL;
  END IF;
END $$;

-- Index for fast lookups by agent
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_id
  ON public.agent_commissions (agent_id);

-- Index for fast lookups by status
CREATE INDEX IF NOT EXISTS idx_agent_commissions_status
  ON public.agent_commissions (status);

-- ─── 3. ENABLE RLS ON AGENT_COMMISSIONS ──────────────────────────────────────

ALTER TABLE public.agent_commissions ENABLE ROW LEVEL SECURITY;

-- Agents can see their own commissions; admins can see all
DROP POLICY IF EXISTS "Commission select access" ON public.agent_commissions;
CREATE POLICY "Commission select access" ON public.agent_commissions FOR SELECT
  TO authenticated
  USING (
    agent_id = auth.uid()
    OR public.is_admin()
  );

-- Only admins (or service role) can insert commissions
DROP POLICY IF EXISTS "Admin commission insert" ON public.agent_commissions;
CREATE POLICY "Admin commission insert" ON public.agent_commissions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Only admins can update commissions (mark as paid, etc.)
DROP POLICY IF EXISTS "Admin commission update" ON public.agent_commissions;
CREATE POLICY "Admin commission update" ON public.agent_commissions FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Only admins can delete commissions
DROP POLICY IF EXISTS "Admin commission delete" ON public.agent_commissions;
CREATE POLICY "Admin commission delete" ON public.agent_commissions FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ─── 4. HELPER FUNCTION: is_agent() ─────────────────────────────────────────
-- Same pattern as is_admin() from phase 6 fix. SECURITY DEFINER avoids RLS recursion.

CREATE OR REPLACE FUNCTION public.is_agent()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_agent = true
      AND agent_status = 'active'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_agent() TO authenticated;

-- ─── 5. UPDATE PROFILES RLS TO EXPOSE AGENT FIELDS ──────────────────────────
-- The existing "Profile access" policy (from phase 6 fix) already allows:
--   - Users to see their own profile
--   - Admins to see all profiles
-- No changes needed here. Agents see their own profile (including agent fields)
-- via the existing id = auth.uid() clause.

-- ─── 6. UPDATE BACKUP TABLE LIST ────────────────────────────────────────────
-- The backup API route (Phase 0) should include agent_commissions.
-- This is handled in code, not SQL.

-- ─── VERIFICATION QUERIES (run after migration to confirm) ──────────────────
-- 
-- Check new columns on profiles:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'profiles'
--   AND (column_name LIKE 'agent%' OR column_name IN ('is_agent', 'commission_rate'))
-- ORDER BY ordinal_position;
--
-- Check agent_commissions table exists:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'agent_commissions'
-- ORDER BY ordinal_position;
--
-- Check existing profiles are unaffected:
-- SELECT id, email, role, is_agent, commission_rate, agent_status
-- FROM public.profiles
-- LIMIT 10;
--
-- Check is_agent() function works:
-- SELECT public.is_agent();  -- should return false for non-agents
--
-- Check RLS policies:
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'agent_commissions';
