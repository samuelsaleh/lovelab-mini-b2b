-- Add 'delete_from_stock' to the order_channel allowed values.
-- This channel is used for write-off orders (gifted or lost items) that need
-- to be removed from stock without generating revenue.
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_order_channel_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_order_channel_check
  CHECK (order_channel IN ('b2b', 'b2c', 'internal', 'consignment', 'delete_from_stock'));
