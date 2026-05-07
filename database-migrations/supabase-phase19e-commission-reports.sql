-- Phase 19e — Archive table + Storage bucket for monthly commission reports.
--
-- One row per (agent, period) generation. Stores:
--   - The Supabase Storage path for the .xlsx (private archive)
--   - The Google Drive file ID + web view link (mom's convenience copy)
--   - The Resend email message ID (so we can trace deliveries / handle bounces)
--   - A snapshot of the data shaped by buildReportData() at the moment of
--     generation, so the file is reproducible even if commissions later
--     change status (e.g. were retro-cancelled).
--   - Total amount, status, who triggered it (cron vs manual admin click).
--
-- Idempotent. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.commission_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end   timestamptz NOT NULL,
  period_label text        NOT NULL,            -- e.g. "May 2026"
  period_key   text        NOT NULL,            -- e.g. "2026-05" (sortable)

  -- Money
  total_due       numeric(12, 2) NOT NULL DEFAULT 0,
  order_count     integer        NOT NULL DEFAULT 0,
  bonus_count     integer        NOT NULL DEFAULT 0,
  loose_b2c_count integer        NOT NULL DEFAULT 0,

  -- Storage references
  storage_path  text,            -- e.g. "2026-05/nicolas-vial-2026-05.xlsx"
  drive_file_id text,            -- Google Drive file ID
  drive_view_link text,          -- https://drive.google.com/file/d/<id>/view

  -- Email
  email_recipient   text,
  email_message_id  text,
  email_sent_at     timestamptz,
  email_error       text,        -- nullable; populated if Resend rejected

  -- Audit
  status text NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'sent', 'failed', 'archived')),
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_source text NOT NULL DEFAULT 'manual'
    CHECK (trigger_source IN ('manual', 'cron')),
  snapshot_data jsonb,           -- buildReportData() output at gen time
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lookups
CREATE INDEX IF NOT EXISTS idx_commission_reports_agent_period
  ON public.commission_reports (agent_id, period_key DESC);

CREATE INDEX IF NOT EXISTS idx_commission_reports_period_key
  ON public.commission_reports (period_key DESC);

CREATE INDEX IF NOT EXISTS idx_commission_reports_created_at
  ON public.commission_reports (created_at DESC);

-- updated_at trigger (re-uses the helper from earlier phases if present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
  ) THEN
    CREATE FUNCTION public.set_updated_at() RETURNS trigger
      LANGUAGE plpgsql AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS commission_reports_set_updated_at ON public.commission_reports;
CREATE TRIGGER commission_reports_set_updated_at
  BEFORE UPDATE ON public.commission_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Row Level Security: admin-only access ──────────────────────────────
ALTER TABLE public.commission_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_reports_admin_all ON public.commission_reports;
CREATE POLICY commission_reports_admin_all ON public.commission_reports
  FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ─── Storage bucket: commission-reports (private, admin-only) ───────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'commission-reports') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'commission-reports',
      'commission-reports',
      false,
      5 * 1024 * 1024, -- 5 MB per file is plenty for an .xlsx
      ARRAY[
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream'
      ]
    );
  END IF;
END $$;

-- Storage RLS: only admins read/write the bucket. Service role bypasses RLS.
DROP POLICY IF EXISTS commission_reports_bucket_admin_select ON storage.objects;
CREATE POLICY commission_reports_bucket_admin_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'commission-reports'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS commission_reports_bucket_admin_insert ON storage.objects;
CREATE POLICY commission_reports_bucket_admin_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'commission-reports'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS commission_reports_bucket_admin_update ON storage.objects;
CREATE POLICY commission_reports_bucket_admin_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'commission-reports'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS commission_reports_bucket_admin_delete ON storage.objects;
CREATE POLICY commission_reports_bucket_admin_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'commission-reports'
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Sanity check
DO $$
DECLARE
  table_exists boolean;
  bucket_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'commission_reports'
  ) INTO table_exists;

  SELECT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'commission-reports'
  ) INTO bucket_exists;

  IF NOT table_exists THEN
    RAISE EXCEPTION 'Phase 19e: commission_reports table missing';
  END IF;
  IF NOT bucket_exists THEN
    RAISE EXCEPTION 'Phase 19e: commission-reports storage bucket missing';
  END IF;

  RAISE NOTICE 'Phase 19e OK — commission_reports table + storage bucket in place';
END $$;
