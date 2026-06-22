-- See supabase/migrations/20260622000000_sample_orders_channel.sql
-- Add 'sample' to order_channel + backfill misclassified Sample orders event docs.

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_order_channel_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_order_channel_check
  CHECK (order_channel IN ('b2b', 'b2c', 'internal', 'consignment', 'delete_from_stock', 'sample'));

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
