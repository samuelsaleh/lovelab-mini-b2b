import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { findB2BFileByPath } from '@/lib/b2b-files';

export async function GET(request, { params }) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'fair-batch' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  const [{ data: batch, error: batchErr }, { data: leads, error: leadsErr }, { data: images, error: imagesErr }, { data: drafts, error: draftsErr }] =
    await Promise.all([
      auth.adminSupabase.from('fair_batches').select('*').eq('id', id).single(),
      auth.adminSupabase.from('fair_leads').select('*').eq('batch_id', id).order('created_at', { ascending: true }),
      auth.adminSupabase.from('fair_images').select('*').eq('batch_id', id).order('created_at', { ascending: true }),
      auth.adminSupabase.from('fair_email_drafts').select('id, lead_id, status, error, sent_at, message_id').eq('batch_id', id),
    ]);

  if (batchErr || !batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }
  if (leadsErr || imagesErr || draftsErr) {
    console.error('[fair-batch GET]', leadsErr?.message, imagesErr?.message, draftsErr?.message);
    return NextResponse.json({ error: 'Failed to load batch details' }, { status: 500 });
  }

  return NextResponse.json({ batch, leads: leads || [], images: images || [], drafts: drafts || [] });
}

export async function PATCH(request, { params }) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'fair-batch' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json();

  const allowed = ['headline', 'paragraph1', 'paragraph2', 'signoff', 'cta_line', 'template_id', 'status', 'fair_name',
                   'subject',
                   'button1_label', 'button1_url', 'button2_label', 'button2_url',
                   'attached_files', 'custom_html',
                   // Per-type body copy. Buttons/attachments are shared.
                   'agent_subject', 'agent_headline', 'agent_paragraph1', 'agent_paragraph2', 'agent_signoff',
                   'partner_subject', 'partner_headline', 'partner_paragraph1', 'partner_paragraph2', 'partner_signoff'];
  const patch = {};
  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  // Validate attached_files — anything we don't recognize won't actually attach
  // when send runs, so reject it up front instead of letting the user think
  // they've attached files that will silently no-op.
  if (Array.isArray(patch.attached_files)) {
    const unknown = patch.attached_files.filter((p) => typeof p !== 'string' || !findB2BFileByPath(p));
    if (unknown.length) {
      return NextResponse.json({
        error: `Unknown attachment path(s): ${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? ` (+${unknown.length - 3} more)` : ''}`,
      }, { status: 400 });
    }
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await auth.adminSupabase
    .from('fair_batches')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[fair-batch PATCH]', error.message);
    return NextResponse.json({ error: 'Failed to update batch' }, { status: 500 });
  }

  return NextResponse.json({ batch: data });
}

export async function DELETE(request, { params }) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'fair-batch' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  // Cascade deletes are configured on the FK in supabase-phase23-fair-assistant.sql,
  // so deleting the batch row also removes its fair_images, fair_leads, fair_email_drafts.
  const { error } = await auth.adminSupabase
    .from('fair_batches')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[fair-batch DELETE]', error.message);
    return NextResponse.json({ error: 'Failed to delete batch' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
