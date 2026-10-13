-- Fair Assistant: store each card photo once (Rafi, 13 Oct 2026).
--
-- The upload screen gives up on a slow upload after 45 s and the person picks the
-- photo again, so the same card could enter a batch twice. The upload route now
-- hashes the file (sha256) and, when this column exists, returns the photo that is
-- already in the batch instead of storing and reading it a second time.
-- Additive and idempotent; the app keeps working without it (no dedupe until it is run).

ALTER TABLE public.fair_images
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS fair_images_batch_content_hash_uidx
  ON public.fair_images (batch_id, content_hash)
  WHERE content_hash IS NOT NULL;

COMMENT ON COLUMN public.fair_images.content_hash IS 'sha256 of the uploaded bytes; one photo per batch.';
