-- =============================================
-- LoveLab B2B - Phase 7: Signup Request Flow
-- Run this in Supabase SQL Editor AFTER phase 6
-- =============================================
-- Stores pending access requests from people who want to join.
-- Admin (alberto@love-lab.com) approves or rejects via email links.

CREATE TABLE IF NOT EXISTS public.pending_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

-- Unique constraint: one pending request per email
CREATE UNIQUE INDEX IF NOT EXISTS pending_signups_email_idx ON public.pending_signups(email);

-- Enable RLS
ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;

-- Only admins can read/manage pending signups (API routes use service role key to bypass RLS anyway)
CREATE POLICY "Admins can manage pending signups" ON public.pending_signups
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─── Verification query (optional) ────────────────────────────────────────
-- SELECT * FROM public.pending_signups ORDER BY created_at DESC;
