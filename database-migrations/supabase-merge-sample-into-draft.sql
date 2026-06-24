-- See supabase/migrations/20260624100000_merge_sample_into_draft.sql
-- Converts order_channel='sample' documents into b2b drafts (no deletes).

UPDATE public.documents
SET
  order_channel = 'b2b',
  status = 'draft',
  event_id = NULL,
  metadata = COALESCE(metadata, '{}'::jsonb)
    || '{"merged_from_sample": true}'::jsonb
    - 'is_sample'
WHERE order_channel = 'sample';
