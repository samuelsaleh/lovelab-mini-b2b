-- Mirror of LoveLab Certificate In rows for B2B sync.
-- Polled from GET /api/certificate-in via /api/cron/igi-certificate-outs (every 10 min).
-- Rows that originated from B2B visit receipts (external_ref visit:…) are skipped in code.

CREATE TABLE IF NOT EXISTS public.igi_certificate_in_sync (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_in_id    bigint      NOT NULL UNIQUE,
  invoice_no   text,
  in_date      date,
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

CREATE INDEX IF NOT EXISTS idx_igi_certificate_in_sync_erp
  ON public.igi_certificate_in_sync (erp_in_id);

CREATE INDEX IF NOT EXISTS idx_igi_certificate_in_sync_model
  ON public.igi_certificate_in_sync (model_id);

ALTER TABLE public.igi_certificate_in_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on igi_certificate_in_sync"
  ON public.igi_certificate_in_sync;
CREATE POLICY "Admin full access on igi_certificate_in_sync"
  ON public.igi_certificate_in_sync
  USING (public.is_admin()) WITH CHECK (public.is_admin());
