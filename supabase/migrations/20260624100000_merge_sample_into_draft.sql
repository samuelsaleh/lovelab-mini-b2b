-- Merge Sample Orders channel into Draft.
-- Existing sample orders become b2b drafts (data preserved, nothing deleted).

UPDATE public.documents
SET
  order_channel = 'b2b',
  status = 'draft',
  event_id = NULL,
  metadata = COALESCE(metadata, '{}'::jsonb)
    || '{"merged_from_sample": true}'::jsonb
    - 'is_sample'
WHERE order_channel = 'sample';
