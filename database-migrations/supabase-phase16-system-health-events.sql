-- =============================================
-- LoveLab B2B — Phase 16: system_health_events
-- =============================================
-- Lightweight audit log for failures that previously got swallowed by silent
-- try/catch blocks (see docs/silent-catches-audit.md). Every recordable
-- failure becomes a row here. Severity ≥ 'error' also fires an admin email
-- (handled in lib/healthEvent.js — not in SQL).
--
-- SAFE TO RE-RUN: idempotent.

CREATE TABLE IF NOT EXISTS public.system_health_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text        NOT NULL,
  severity    text        NOT NULL CHECK (severity IN ('info','warn','error','critical')),
  message     text        NOT NULL,
  context     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  alerted_at  timestamptz,
  resolved_at timestamptz,
  resolved_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_note text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Admin panel — list open events newest first, scoped by severity.
CREATE INDEX IF NOT EXISTS idx_system_health_events_open
  ON public.system_health_events (severity, created_at DESC)
  WHERE resolved_at IS NULL;

-- Throttle lookup — recent alerts for a given source.
CREATE INDEX IF NOT EXISTS idx_system_health_events_alerted
  ON public.system_health_events (source, alerted_at DESC)
  WHERE alerted_at IS NOT NULL;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- service_role bypasses RLS so the helper can insert. Authenticated users
-- only see/update if they're admin.

ALTER TABLE public.system_health_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can read system health" ON public.system_health_events;
CREATE POLICY "Admin can read system health" ON public.system_health_events
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can update system health" ON public.system_health_events;
CREATE POLICY "Admin can update system health" ON public.system_health_events
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No INSERT or DELETE policy: only the service role (server code) writes,
-- and rows are kept indefinitely for audit. Manual cleanup via service role
-- if ever needed.

-- ─── Verification (optional, run after) ─────────────────────────────────────
-- INSERT INTO public.system_health_events(source, severity, message, context)
--   VALUES ('migration_verify', 'info', 'Phase 16 applied', '{}'::jsonb);
-- SELECT * FROM public.system_health_events ORDER BY created_at DESC LIMIT 5;
