-- =============================================
-- LoveLab B2B - Phase 9: Reports & Agent Payments
-- =============================================

-- ─── 1. CREATE SAVED_REPORTS TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('documents', 'commissions', 'clients', 'events')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own reports" ON public.saved_reports;
CREATE POLICY "Users can manage their own reports" ON public.saved_reports
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all reports" ON public.saved_reports;
CREATE POLICY "Admins can view all reports" ON public.saved_reports
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ─── 2. CREATE AGENT_PAYMENTS TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_payments_agent_id ON public.agent_payments (agent_id);

ALTER TABLE public.agent_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage agent payments" ON public.agent_payments;
CREATE POLICY "Admins can manage agent payments" ON public.agent_payments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Agents can view their own payments" ON public.agent_payments;
CREATE POLICY "Agents can view their own payments" ON public.agent_payments
  FOR SELECT
  TO authenticated
  USING (agent_id = auth.uid() OR public.is_admin());

-- Update backup to include these tables: 'saved_reports', 'agent_payments'
