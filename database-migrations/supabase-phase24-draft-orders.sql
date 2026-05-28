-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Draft (parked) orders
-- Date: 2026-05-28
-- Purpose: Add a `status` column to documents so an agent can save an order as
--          a "draft" — a real, reopenable order row that is NOT yet committed:
--          no commission, no new-client bonus, no notification email, no
--          LoveLab sync, and excluded from revenue/analytics. Re-opening a
--          draft and hitting "Send" promotes it to 'sent', at which point all
--          the normal side-effects fire exactly once.
--
--          Default is 'sent' so every existing row and every current save path
--          is unchanged — this migration is purely additive and back-compatible.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the column (safe to run multiple times). NOT NULL + default 'sent'
--    backfills every existing row to 'sent' in the same statement.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent';

-- 2. Constrain to the two known states. No-op if it already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_status_check'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_status_check
      CHECK (status IN ('draft', 'sent'));
  END IF;
END $$;

-- 3. Defensive backfill in case the column pre-existed as nullable.
UPDATE public.documents
  SET status = 'sent'
  WHERE status IS NULL;

-- 4. Partial index for the common "my drafts" lookup (agent's own, not trashed).
CREATE INDEX IF NOT EXISTS idx_documents_created_by_status
  ON public.documents(created_by, status)
  WHERE deleted_at IS NULL;
