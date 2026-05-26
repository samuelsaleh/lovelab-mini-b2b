-- Stores the Resend message_id for each sent draft so we can correlate
-- bounces and replies later. Idempotent: safe to re-run.

ALTER TABLE public.fair_email_drafts
  ADD COLUMN IF NOT EXISTS message_id text;
