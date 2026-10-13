import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { uploadFileToDrive, deleteFileFromDrive } from '@/lib/google-drive';
import { triggerN8nCardWebhook } from '@/lib/fair-assistant/n8n';

// Allow up to 60s per file. Drive uploads + n8n trigger can take
// 5-15s under load; the default 10s timeout was killing ~1 in 20
// uploads mid-batch when the user was sending 30+ pictures in a row.
export const maxDuration = 60;

// Only card photos. A PDF or a screenshot of something else used to vanish inside
// n8n with no answer and stay "processing" forever.
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const ALLOWED_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 120, prefix: 'fair-upload' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const inboxFolderId = process.env.FAIR_DRIVE_INBOX_FOLDER_ID;
  if (!inboxFolderId) {
    return NextResponse.json({ error: 'FAIR_DRIVE_INBOX_FOLDER_ID is not configured' }, { status: 503 });
  }

  const formData = await request.formData();
  const batchId = formData.get('batchId');
  const file = formData.get('file');

  if (!batchId || typeof batchId !== 'string') {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  }
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const { data: batch, error: batchErr } = await auth.adminSupabase
    .from('fair_batches')
    .select('id, status, total_images')
    .eq('id', batchId)
    .single();

  if (batchErr || !batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  const fileName = file.name || `card-${Date.now()}.jpg`;
  const mimeType = file.type || 'image/jpeg';
  if (!ALLOWED_TYPES.has(mimeType.toLowerCase()) && !(mimeType === 'application/octet-stream' && ALLOWED_EXT.test(fileName))) {
    return NextResponse.json({ error: `"${fileName}" is not a photo. Use JPEG, PNG, WebP or HEIC.` }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `"${fileName}" is too large (${Math.round(file.size / 1024 / 1024)} MB, max ${MAX_BYTES / 1024 / 1024} MB).` }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

  // The same bytes already in this batch (a retry after a timeout): hand back that photo, store nothing twice.
  // Skipped quietly when the migration adding content_hash has not been run yet.
  const { data: sameRows, error: sameErr } = await auth.adminSupabase
    .from('fair_images')
    .select('*')
    .eq('batch_id', batchId)
    .eq('content_hash', contentHash)
    .limit(1);
  const hasHashColumn = !sameErr;
  if (hasHashColumn && sameRows?.length) {
    return NextResponse.json({ image: sameRows[0], driveFileId: sameRows[0].drive_file_id, duplicate: true });
  }

  let driveFile;
  try {
    driveFile = await uploadFileToDrive(inboxFolderId, fileName, buffer, mimeType);
  } catch (err) {
    console.error('[fair-upload] Drive upload failed:', err.message);
    const reason = /credentials/i.test(err.message) ? 'Google Drive credentials are not configured on this deployment.'
      : /401|invalid_grant/i.test(err.message) ? 'Google Drive token rejected — refresh token expired or revoked.'
      : /404/i.test(err.message) ? 'Drive inbox folder not found — check FAIR_DRIVE_INBOX_FOLDER_ID and that the connected account has access.'
      : /403/i.test(err.message) ? 'Drive denied the upload — the connected account does not have permission on the inbox folder.'
      : `Drive upload failed: ${err.message}`;
    return NextResponse.json({ error: reason }, { status: 502 });
  }

  const { data: imageRow, error: imageErr } = await auth.adminSupabase
    .from('fair_images')
    .insert({
      batch_id: batchId,
      drive_file_id: driveFile.id,
      file_name: fileName,
      status: 'processing',
      ...(hasHashColumn ? { content_hash: contentHash } : {}),
    })
    .select('*')
    .single();

  if (imageErr && hasHashColumn && imageErr.code === '23505') {
    // Two identical uploads raced past the check above; the unique index kept one. Return it, drop our extra Drive copy.
    const { data: winner } = await auth.adminSupabase
      .from('fair_images').select('*').eq('batch_id', batchId).eq('content_hash', contentHash).limit(1);
    deleteFileFromDrive(driveFile.id).catch(() => {});
    if (winner?.length) return NextResponse.json({ image: winner[0], driveFileId: winner[0].drive_file_id, duplicate: true });
  }
  if (imageErr) {
    console.error('[fair-upload] image row failed:', imageErr.message);
    return NextResponse.json({ error: 'Failed to record image' }, { status: 500 });
  }

  await auth.adminSupabase
    .from('fair_batches')
    .update({
      status: batch.status === 'uploading' ? 'extracting' : batch.status,
      total_images: (batch.total_images || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);

  try {
    await triggerN8nCardWebhook({
      driveFileId: driveFile.id,
      mimeType,
      batchId,
      imageId: imageRow.id,
    });
  } catch (err) {
    console.error('[fair-upload] n8n trigger failed:', err.message);
    await auth.adminSupabase
      .from('fair_images')
      .update({ status: 'failed', error: err.message, updated_at: new Date().toISOString() })
      .eq('id', imageRow.id);
    return NextResponse.json({ error: 'Uploaded to Drive but failed to trigger processing' }, { status: 502 });
  }

  return NextResponse.json({ image: imageRow, driveFileId: driveFile.id });
}
