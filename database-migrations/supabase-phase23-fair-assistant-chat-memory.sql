-- Per-batch chat history with the outreach assistant. When Alberto closes the
-- chat panel and reopens it, the conversation is still there, and the model
-- gets the full prior context on the next turn. Cascades with the batch.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.fair_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.fair_batches(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fair_chat_messages_batch_created
  ON public.fair_chat_messages(batch_id, created_at);

ALTER TABLE public.fair_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fair_chat_messages_admin_all" ON public.fair_chat_messages;
CREATE POLICY "fair_chat_messages_admin_all" ON public.fair_chat_messages
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
