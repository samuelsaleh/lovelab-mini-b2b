-- Extend order_channel to support 'internal' for supplier/manufacturing orders.
-- Internal orders are excluded from all revenue analytics and commission hooks.

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_order_channel_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_order_channel_check
    CHECK (order_channel IN ('b2b', 'b2c', 'internal'));
