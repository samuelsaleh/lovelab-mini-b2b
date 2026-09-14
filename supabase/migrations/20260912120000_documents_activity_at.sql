-- Float a re-edited order to the top of the list without rewriting created_at.
--
-- activity_at is bumped only by a user re-edit save (PUT /api/documents/:id).
-- Email-status mirrors, bulk filing, Synalia writes, and renames do not touch
-- it, so those incidental updates cannot shuffle the list. Lists order by
-- activity_at desc, then created_at desc.
--
-- Add the column nullable first, then backfill from created_at. A DEFAULT
-- now() on ADD COLUMN would stamp every existing row with the migration time
-- and bury the real created order.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS activity_at timestamptz;

UPDATE public.documents
  SET activity_at = COALESCE(created_at, now())
  WHERE activity_at IS NULL;

ALTER TABLE public.documents
  ALTER COLUMN activity_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS documents_activity_at_idx
  ON public.documents (activity_at DESC);

COMMENT ON COLUMN public.documents.activity_at IS
  'Last user re-edit save. Document lists sort by this so an updated order stays the same row but moves to the top. Not bumped by incidental writes (email status, bulk file, Synalia, rename).';
