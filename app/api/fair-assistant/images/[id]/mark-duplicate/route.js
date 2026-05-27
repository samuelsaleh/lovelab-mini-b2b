import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';

// Manual resolution for stuck images whose Salesforce duplicate path in n8n
// never called back. Flips the row to "processed" and annotates the error
// column so the UI can show "✓ done (already in Salesforce)" instead of a
// red stuck banner. Idempotent.
export async function POST(request, { params }) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'fair-image-dup' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'image id is required' }, { status: 400 });

  const { data: img, error: lookupErr } = await auth.adminSupabase
    .from('fair_images')
    .select('id, batch_id, status')
    .eq('id', id)
    .single();

  if (lookupErr || !img) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  const { error: updateErr } = await auth.adminSupabase
    .from('fair_images')
    .update({
      status: 'processed',
      error: 'Duplicate — already in Salesforce (manually resolved)',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    console.error('[mark-duplicate] update failed:', updateErr.message);
    return NextResponse.json({ error: 'Failed to mark image as duplicate' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, imageId: id });
}
