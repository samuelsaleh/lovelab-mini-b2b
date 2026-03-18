-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: B2B / B2C order channel split
-- Date: 2026-03-18
-- Purpose: Add order_channel column to documents table to distinguish
--          B2B orders (from trade fairs / quote builder — default)
--          from B2C orders (from the website via agent discount codes).
--          The backend team will populate B2C orders via the external API.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the column (safe to run multiple times)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS order_channel text DEFAULT 'b2b';

-- 2. Add check constraint (only after backfill, to avoid any NULL clash)
--    If constraint already exists this will no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_order_channel_check'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_order_channel_check
      CHECK (order_channel IN ('b2b', 'b2c'));
  END IF;
END $$;

-- 3. Backfill: all existing rows become b2b
UPDATE public.documents
  SET order_channel = 'b2b'
  WHERE order_channel IS NULL;

-- 4. Index for filtering by channel
CREATE INDEX IF NOT EXISTS idx_documents_order_channel
  ON public.documents(order_channel);

-- 5. Combined index for agent + channel queries (used by agent detail page)
CREATE INDEX IF NOT EXISTS idx_documents_created_by_channel
  ON public.documents(created_by, order_channel)
  WHERE deleted_at IS NULL;
