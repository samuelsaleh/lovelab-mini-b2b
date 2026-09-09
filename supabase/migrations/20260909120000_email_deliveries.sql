-- Email delivery tracking (Sept 2026).
--
-- Sam, 9 Sept 2026: an order confirmation went out, was accepted by Resend,
-- reached the three internal BCCs — and bounced for the one person it was
-- for. Nobody knew. Resend tells us what happened to every email (delivered,
-- delayed, bounced, complained) by webhook, and lets us ask by id with the
-- API key. This table is where those answers live, one row per email we
-- send: order confirmations, fair follow-ups, internal notices.
--
-- The latest outcome is mirrored onto the thing the email was about
-- (documents.metadata.client_email, fair_email_drafts.delivery_*) so the
-- screens that already show orders and leads can show it without a join.

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Resend's email id (the `id` returned by POST /emails). One row per send.
  resend_id text NOT NULL UNIQUE,
  kind text NOT NULL
    CHECK (kind IN ('order_confirmation', 'fair_outreach', 'internal_notice', 'other')),
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  draft_id uuid,
  recipient text,
  subject text,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'suppressed', 'unknown')),
  -- What Resend / the receiving server said, verbatim.
  detail text,
  -- What a person should do about it, in plain words (lib/emailDeliveries.js).
  advice text,
  bounce_type text,
  bounce_subtype text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  last_event_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_deliveries_document_id_idx ON public.email_deliveries (document_id);
CREATE INDEX IF NOT EXISTS email_deliveries_draft_id_idx    ON public.email_deliveries (draft_id);
CREATE INDEX IF NOT EXISTS email_deliveries_pending_idx     ON public.email_deliveries (status, sent_at);

DROP TRIGGER IF EXISTS set_email_deliveries_updated_at ON public.email_deliveries;
CREATE TRIGGER set_email_deliveries_updated_at
  BEFORE UPDATE ON public.email_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin email_deliveries access" ON public.email_deliveries;
CREATE POLICY "Admin email_deliveries access" ON public.email_deliveries FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.email_deliveries IS
  'One row per email sent through Resend; status follows Resend webhooks (delivered / bounced / complained ...) or a daily poll of GET /emails/:id.';

-- The fair assistant already lists drafts with a send status; give it the
-- delivery outcome next to it. Only when the fair tables exist.
DO $$
BEGIN
  IF to_regclass('public.fair_email_drafts') IS NOT NULL THEN
    ALTER TABLE public.fair_email_drafts
      ADD COLUMN IF NOT EXISTS delivery_status text,
      ADD COLUMN IF NOT EXISTS delivery_error text;
    ALTER TABLE public.email_deliveries
      DROP CONSTRAINT IF EXISTS email_deliveries_draft_id_fkey;
    ALTER TABLE public.email_deliveries
      ADD CONSTRAINT email_deliveries_draft_id_fkey
      FOREIGN KEY (draft_id) REFERENCES public.fair_email_drafts(id) ON DELETE SET NULL;
  END IF;
END $$;
