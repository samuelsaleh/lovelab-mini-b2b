-- Adds lead_type to fair_leads so Alberto can run different outreach templates
-- per recipient category (shop, agent, partner). Defaults to 'shop' which keeps
-- existing leads working with the original generic template.
--
-- Run in Supabase SQL editor. Idempotent: safe to re-run.

ALTER TABLE public.fair_leads
  ADD COLUMN IF NOT EXISTS lead_type text NOT NULL DEFAULT 'shop'
  CHECK (lead_type IN ('shop', 'agent', 'partner', 'other'));
