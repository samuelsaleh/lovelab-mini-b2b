-- Editable per-type email templates within a batch.
--
-- Until now, only the shop email was editable in the Outreach UI — agent and
-- partner leads always got the hardcoded defaultTemplateForLeadType() preset
-- from lib/fair-assistant/templates.js. This migration unlocks per-batch
-- customisation for those types.
--
-- Buttons, CTA line, attachments and custom_html stay shared across all three
-- types (same brand, same downloads). Only the body copy varies.
--
-- Empty/NULL values continue to fall through to the hardcoded preset so an
-- empty Agents tab still produces a valid agent email. Safe to re-run.

ALTER TABLE public.fair_batches
  ADD COLUMN IF NOT EXISTS agent_subject     text,
  ADD COLUMN IF NOT EXISTS agent_headline    text,
  ADD COLUMN IF NOT EXISTS agent_paragraph1  text,
  ADD COLUMN IF NOT EXISTS agent_paragraph2  text,
  ADD COLUMN IF NOT EXISTS agent_signoff     text,
  ADD COLUMN IF NOT EXISTS partner_subject    text,
  ADD COLUMN IF NOT EXISTS partner_headline   text,
  ADD COLUMN IF NOT EXISTS partner_paragraph1 text,
  ADD COLUMN IF NOT EXISTS partner_paragraph2 text,
  ADD COLUMN IF NOT EXISTS partner_signoff    text;
