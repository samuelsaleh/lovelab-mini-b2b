-- =============================================
-- LoveLab B2B - Phase 23: Fair Assistant
-- Card batch OCR + outreach email workflow
-- =============================================

CREATE TABLE IF NOT EXISTS public.fair_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  name text NOT NULL,
  fair_name text,
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'extracting', 'extracted', 'drafting', 'generating', 'sending', 'complete', 'failed', 'stuck')),
  template_id text NOT NULL DEFAULT 'generic',
  headline text,
  paragraph1 text,
  paragraph2 text,
  signoff text DEFAULT 'Warm regards,' || E'\n' || 'Alberto Saleh' || E'\n' || 'LoveLab Antwerp',
  total_images integer NOT NULL DEFAULT 0,
  total_leads integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fair_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.fair_batches(id) ON DELETE CASCADE,
  drive_file_id text,
  file_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fair_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.fair_batches(id) ON DELETE CASCADE,
  image_id uuid REFERENCES public.fair_images(id) ON DELETE SET NULL,
  first_name text,
  last_name text,
  company text,
  email text,
  phone text,
  mobile_phone text,
  title text,
  country text,
  language text,
  language_label text,
  street text,
  city text,
  state text,
  postal_code text,
  salesforce_id text,
  salesforce_url text,
  lead_hash text,
  status text NOT NULL DEFAULT 'extracted'
    CHECK (status IN ('extracted', 'ready', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fair_email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.fair_batches(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.fair_leads(id) ON DELETE CASCADE,
  subject text,
  body_html text,
  language text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'draft_ready', 'sending', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_fair_batches_created_by ON public.fair_batches(created_by);
CREATE INDEX IF NOT EXISTS idx_fair_batches_status ON public.fair_batches(status);
CREATE INDEX IF NOT EXISTS idx_fair_images_batch_id ON public.fair_images(batch_id);
CREATE INDEX IF NOT EXISTS idx_fair_leads_batch_id ON public.fair_leads(batch_id);
CREATE INDEX IF NOT EXISTS idx_fair_leads_batch_status ON public.fair_leads(batch_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fair_leads_batch_hash ON public.fair_leads(batch_id, lead_hash)
  WHERE lead_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fair_email_drafts_batch_status ON public.fair_email_drafts(batch_id, status);

ALTER TABLE public.fair_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fair_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fair_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fair_email_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin fair_batches access" ON public.fair_batches;
CREATE POLICY "Admin fair_batches access" ON public.fair_batches FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin fair_images access" ON public.fair_images;
CREATE POLICY "Admin fair_images access" ON public.fair_images FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin fair_leads access" ON public.fair_leads;
CREATE POLICY "Admin fair_leads access" ON public.fair_leads FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin fair_email_drafts access" ON public.fair_email_drafts;
CREATE POLICY "Admin fair_email_drafts access" ON public.fair_email_drafts FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Realtime for live lead table updates in the UI
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fair_leads;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fair_batches;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fair_email_drafts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
