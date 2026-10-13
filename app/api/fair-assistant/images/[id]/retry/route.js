import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { triggerN8nCardWebhook } from '@/lib/fair-assistant/n8n';

// "Try again" for a photo the card reader never answered (or answered with an
// error). Sends the same Drive file to n8n again: n8n downloads by file id, so
// it works even after the file moved to the Processed/Errors folder. A card that
// really finished meanwhile is safe: the lead insert is idempotent (lead hash)
// and a Salesforce duplicate comes back as "already in Salesforce".
export async function POST(request, { params }) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'fair-image-retry' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'image id is required' }, { status: 400 });

  const db = auth.adminSupabase;
  const { data: image, error: imgErr } = await db
    .from('fair_images')
    .select('id, batch_id, drive_file_id, file_name, status')
    .eq('id', id)
    .single();

  if (imgErr || !image) return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  if (image.status === 'processed') {
    return NextResponse.json({ error: 'This photo is already done.' }, { status: 409 });
  }
  if (!image.drive_file_id) {
    return NextResponse.json({ error: 'This photo has no file to read again. Delete it and upload it again.' }, { status: 409 });
  }

  const now = () => new Date().toISOString();
  // created_at is not touched: "no answer for N min" restarts from updated_at semantics only on the server's side.
  await db.from('fair_images').update({ status: 'processing', error: null, updated_at: now() }).eq('id', id);

  try {
    await triggerN8nCardWebhook({
      driveFileId: image.drive_file_id,
      mimeType: guessMime(image.file_name),
      batchId: image.batch_id,
      imageId: image.id,
    });
  } catch (err) {
    console.error('[fair-image retry] n8n trigger failed:', err.message);
    await db.from('fair_images').update({ status: 'failed', error: `Could not start the card reader: ${err.message}`, updated_at: now() }).eq('id', id);
    return NextResponse.json({ error: 'The card reader did not accept the photo. Try again in a minute.' }, { status: 502 });
  }

  await db.from('fair_batches').update({ status: 'extracting', updated_at: now() }).eq('id', image.batch_id).in('status', ['extracted', 'failed']);
  return NextResponse.json({ ok: true, imageId: id });
}

function guessMime(name = '') {
  const ext = String(name).toLowerCase().split('.').pop();
  return { png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' }[ext] || 'image/jpeg';
}
