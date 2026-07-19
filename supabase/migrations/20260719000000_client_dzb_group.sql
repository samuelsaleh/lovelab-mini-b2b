-- Persist DZB adhérent number + jeweler groupement on the shared clients table
-- so restock / saved-client select can prefill them without retyping.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS dzb_client_number text,
  ADD COLUMN IF NOT EXISTS jeweler_group text;
