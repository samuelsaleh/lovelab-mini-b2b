-- Remember separate shipping address on the shared clients table.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS shipping_same_as_billing boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS shipping_address_line2 text,
  ADD COLUMN IF NOT EXISTS shipping_country text;
