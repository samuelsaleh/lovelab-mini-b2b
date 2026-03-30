-- Extend order_channel to support 'consignment' for goods sent on consignment.
-- Consignment orders are excluded from revenue analytics and commission hooks.

-- 1. Extend the order_channel constraint
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_order_channel_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_order_channel_check
    CHECK (order_channel IN ('b2b', 'b2c', 'internal', 'consignment'));

-- 2. Add consignment_agent_id column for fast, indexed agent filtering
--    (avoids slow JSONB path queries when agents fetch their consignment orders)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS consignment_agent_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_consignment_agent
  ON public.documents(consignment_agent_id)
  WHERE order_channel = 'consignment';

-- 3. consignment_contacts table — reusable recipients for consignment orders
CREATE TABLE IF NOT EXISTS public.consignment_contacts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text        NOT NULL,
  company     text,
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- RLS: admin-only read/write
ALTER TABLE public.consignment_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on consignment_contacts" ON public.consignment_contacts;
CREATE POLICY "Admin full access on consignment_contacts"
  ON public.consignment_contacts
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
