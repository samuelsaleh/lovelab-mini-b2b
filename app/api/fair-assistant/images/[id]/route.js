import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { deleteFileFromDrive } from '@/lib/google-drive';

// Lets the user evict a stuck "processing" image from a batch when n8n's
// callback never fires (network glitch, wrong callback URL, etc.). Removes
// the row, best-effort-deletes the Drive file, decrements the batch counter,
// and recomputes the batch status from what's left.
export async function DELETE(request, { params }) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'fair-image' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'image id is required' }, { status: 400 });

  // Look up the image first so we know its batch and Drive file id.
  const { data: image, error: imgErr } = await auth.adminSupabase
    .from('fair_images')
    .select('id, batch_id, drive_file_id, status')
    .eq('id', id)
    .single();

  if (imgErr || !image) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  // Best-effort: try to delete from Drive. Don't fail the request if Drive
  // rejects — n8n may have already moved the file to /processed or /errors.
  let driveResult = null;
  if (image.drive_file_id) {
    try {
      driveResult = await deleteFileFromDrive(image.drive_file_id);
    } catch (err) {
      console.warn('[fair-image DELETE] Drive delete failed (continuing):', err.message);
      driveResult = { deleted: false, error: err.message };
    }
  }

  // Delete the image row. fair_leads.image_id has ON DELETE SET NULL so any
  // already-created lead row keeps its data and just loses the back-link.
  const { error: delErr } = await auth.adminSupabase
    .from('fair_images')
    .delete()
    .eq('id', id);

  if (delErr) {
    console.error('[fair-image DELETE] row delete failed:', delErr.message);
    return NextResponse.json({ error: 'Failed to delete image row' }, { status: 500 });
  }

  // Recompute batch.total_images from the live count rather than decrementing
  // (safer if anything got out of sync earlier).
  const { count: remaining } = await auth.adminSupabase
    .from('fair_images')
    .select('*', { count: 'exact', head: true })
    .eq('batch_id', image.batch_id);

  await auth.adminSupabase
    .from('fair_batches')
    .update({ total_images: remaining || 0, updated_at: new Date().toISOString() })
    .eq('id', image.batch_id);

  return NextResponse.json({
    ok: true,
    deletedImageId: id,
    drive: driveResult,
    remainingImages: remaining || 0,
  });
}
