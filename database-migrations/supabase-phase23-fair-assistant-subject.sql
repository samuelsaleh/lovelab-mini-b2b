-- Explicit email subject line per batch. Previously the rendered email used
-- the Headline field as both the H1 inside the email AND the email subject —
-- those want to read differently ("Following up from Vicenzaoro 2026" as
-- subject vs "Great meeting you" as headline). Idempotent; safe to re-run.

ALTER TABLE public.fair_batches
  ADD COLUMN IF NOT EXISTS subject text;
