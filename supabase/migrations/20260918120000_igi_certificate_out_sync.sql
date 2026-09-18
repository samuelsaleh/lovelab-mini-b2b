-- Mirror of LoveLab Certificate Out rows for B2B sync / matching.
-- Polled from GET /api/certificate-out via /api/cron/igi-certificate-outs.

CREATE TABLE IF NOT EXISTS public.igi_certificate_out_sync (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_out_id   bigint      NOT NULL UNIQUE,
  invoice_no   text,
  out_date     date,
  party        text,
  description  text,
  pcs          numeric,
  remark       text,
  source       text,
  external_ref text,
  model_id     uuid        REFERENCES public.igi_models(id) ON DELETE SET NULL,
  serial       text,
  payload      jsonb,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_igi_certificate_out_sync_erp
  ON public.igi_certificate_out_sync (erp_out_id);

CREATE INDEX IF NOT EXISTS idx_igi_certificate_out_sync_model
  ON public.igi_certificate_out_sync (model_id);

ALTER TABLE public.igi_certificate_out_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on igi_certificate_out_sync"
  ON public.igi_certificate_out_sync;
CREATE POLICY "Admin full access on igi_certificate_out_sync"
  ON public.igi_certificate_out_sync
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- IGI users do not see ERP out sync (LoveLab-only).
