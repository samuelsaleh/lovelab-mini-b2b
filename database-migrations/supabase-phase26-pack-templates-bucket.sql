-- ─────────────────────────────────────────────────────────────────────────
-- Phase 26 — Pack order-template storage bucket.
--
-- Holds one auto-generated Excel order template per pack, keyed by pack id
-- ({packId}.xlsx). Generated on pack create/update by lib/packTemplates.js and
-- served (with a clean filename + self-heal) by /api/pack-templates/[id]/download.
--
-- PRIVATE bucket: reads and writes go exclusively through the service-role
-- client in server code, so no public access or per-row storage RLS policies
-- are needed. Pricing lives in these files, so they must NOT be world-readable.
--
-- Idempotent: safe to re-run (re-asserts the bucket exists and is private).
-- Run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('pack-templates', 'pack-templates', false)
on conflict (id) do update set public = false;
