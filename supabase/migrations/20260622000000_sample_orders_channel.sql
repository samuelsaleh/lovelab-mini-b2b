-- Add 'sample' to order_channel allowed values.
-- Sample orders are temporary — not confirmed, not counted in revenue,
-- and must be excluded from the Laravel ERP import job.
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_order_channel_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_order_channel_check
  CHECK (order_channel IN ('b2b', 'b2c', 'internal', 'consignment', 'delete_from_stock', 'sample'));

-- Backfill: orders filed in event folders whose name contains "sample"
-- were saved as b2b but are actually temporary samples.
UPDATE public.documents d
SET
  order_channel = 'sample',
  event_id = NULL,
  metadata = COALESCE(d.metadata, '{}'::jsonb) || '{"is_sample": true}'::jsonb
FROM public.events e
WHERE d.event_id = e.id
  AND d.order_channel = 'b2b'
  AND d.document_type = 'order'
  AND lower(trim(e.name)) LIKE '%sample%';
