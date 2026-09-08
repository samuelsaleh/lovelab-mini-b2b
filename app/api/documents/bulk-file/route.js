/**
 * PATCH /api/documents/bulk-file
 *
 * Body: { ids: string[], event_id: string | null }
 *
 * Files many orders into one fair (or takes them out of any fair with null)
 * in a single request. The agent forgot to link a batch of orders to the fair
 * folder; ticking them in All Documents and picking the fair fixes that here.
 *
 * Only `event_id` moves. `agent_id`, `created_by` and `order_channel` are left
 * exactly as they are, so the order stays attributed to the agent who sold it
 * while also showing up in the fair folder — the two fields are independent by
 * design (see supabase/migrations/20260818130000_documents_agent_id.sql).
 *
 * Drafts and trashed documents are never filed (same rule as saving one), and
 * commissions are recomputed for every revenue order whose fair changed, like
 * the single-document PATCH does.
 *
 * Access: admin only.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { recordHealthEvent } from '@/lib/healthEvent';
import { resolveCommissionAgent, upsertCommissionForDocument } from '@/lib/commissionAttribution';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_BULK_IDS = 200;

export async function PATCH(request) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 30,
      prefix: 'documents-bulk-file',
    });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminSupabase = createAdminClient();
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!Object.prototype.hasOwnProperty.call(body || {}, 'event_id')) {
      return NextResponse.json({ error: 'event_id is required (a fair id, or null to unfile)' }, { status: 400 });
    }
    const eventId = body.event_id ?? null;
    if (eventId !== null && (typeof eventId !== 'string' || !UUID_REGEX.test(eventId))) {
      return NextResponse.json({ error: 'event_id must be a valid UUID or null' }, { status: 400 });
    }
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
    }
    if (body.ids.length > MAX_BULK_IDS) {
      return NextResponse.json(
        { error: `Too many ids (max ${MAX_BULK_IDS})` },
        { status: 400 },
      );
    }

    const ids = [...new Set(body.ids)];
    if (!ids.every((id) => typeof id === 'string' && UUID_REGEX.test(id))) {
      return NextResponse.json({ error: 'ids must all be valid UUIDs' }, { status: 400 });
    }

    // The target must be a real folder — a typo'd id would silently orphan the
    // orders out of every folder.
    let event = null;
    if (eventId) {
      const { data: evt, error: evtErr } = await adminSupabase
        .from('events')
        .select('id, name, type')
        .eq('id', eventId)
        .maybeSingle();
      if (evtErr) {
        console.error('[documents bulk-file] event lookup failed:', evtErr.message);
        return NextResponse.json({ error: 'Failed to look up event' }, { status: 500 });
      }
      if (!evt) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      event = evt;
    }

    const { data: docs, error: fetchErr } = await adminSupabase
      .from('documents')
      .select('id, status, deleted_at, event_id')
      .in('id', ids);
    if (fetchErr) {
      console.error('[documents bulk-file] fetch failed:', fetchErr.message);
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
    }

    const found = new Map((docs || []).map((d) => [d.id, d]));
    const notFound = ids.filter((id) => !found.has(id));
    const skipped = [];
    const toUpdate = [];
    for (const doc of found.values()) {
      if (doc.deleted_at) { skipped.push({ id: doc.id, reason: 'trashed' }); continue; }
      if (doc.status === 'draft') { skipped.push({ id: doc.id, reason: 'draft' }); continue; }
      if ((doc.event_id ?? null) === eventId) { skipped.push({ id: doc.id, reason: 'already_filed' }); continue; }
      toUpdate.push(doc.id);
    }

    let updatedRows = [];
    if (toUpdate.length > 0) {
      const { data: updated, error: updateErr } = await adminSupabase
        .from('documents')
        .update({ event_id: eventId })
        .in('id', toUpdate)
        .select('id, event_id, agent_id, created_by, total_amount, status, order_channel, document_type, client_name, client_company, metadata');
      if (updateErr) {
        console.error('[documents bulk-file] update failed:', updateErr.message);
        return NextResponse.json({ error: 'Failed to file documents' }, { status: 500 });
      }
      updatedRows = updated || [];
    }

    // Re-filing a revenue order onto another fair changes where its commission
    // is counted, so refresh the ledger row by row. A recalc hiccup never fails
    // the request — the orders are already filed.
    let commissionsRefreshed = 0;
    for (const row of updatedRows) {
      const isRevenue = row.total_amount > 0 && row.status !== 'draft' &&
        row.order_channel !== 'internal' && row.order_channel !== 'consignment';
      if (!isRevenue) continue;
      try {
        const attribution = await resolveCommissionAgent(adminSupabase, row);
        if (attribution) {
          await upsertCommissionForDocument(adminSupabase, {
            document: row,
            profile: attribution.profile,
            agentId: attribution.agentId,
          });
          commissionsRefreshed += 1;
        }
      } catch (recalcErr) {
        await recordHealthEvent({
          source: 'documents_bulk_file_commission_recalc',
          severity: 'warn',
          message: recalcErr?.message || 'Commission recalc on bulk file failed',
          context: { documentId: row.id, eventId },
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      event: event ? { id: event.id, name: event.name, type: event.type } : null,
      updated_count: updatedRows.length,
      updated_ids: updatedRows.map((r) => r.id),
      skipped,
      not_found: notFound,
      commissions_refreshed: commissionsRefreshed,
    });
  } catch (err) {
    console.error('[documents bulk-file] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
