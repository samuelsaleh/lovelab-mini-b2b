/**
 * PATCH /api/commissions/customer-paid-bulk
 *
 * Body: { ids: string[], paid: boolean }
 *
 * Bulk version of /api/commissions/[id]/customer-paid. Ticking twenty orders
 * one request at a time burns through the per-IP rate limit and makes the UI
 * wait on twenty round trips, so the selection UI on the agent page sends one
 * request instead.
 *
 * Mirrors the single-row cascade: when an order row is ticked, the linked
 * type='new_client_bonus' row for the same agent + document is ticked too.
 * The cascade is grouped per agent so one agent's documents can never flip
 * another agent's bonuses, even if two agents share a document id.
 *
 * Access: admin only.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_BULK_IDS = 200;

export async function PATCH(request) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 30,
      prefix: 'commission-customer-paid-bulk',
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

    if (typeof body?.paid !== 'boolean') {
      return NextResponse.json({ error: 'paid must be a boolean' }, { status: 400 });
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

    const customer_paid_at = body.paid ? new Date().toISOString() : null;

    const { data: updated, error } = await adminSupabase
      .from('agent_commissions')
      .update({ customer_paid_at })
      .in('id', ids)
      .select('id, customer_paid_at, status, agent_id, document_id, type');

    if (error) {
      console.error('[customer-paid-bulk PATCH] Error:', error.message);
      return NextResponse.json({ error: 'Failed to update commissions' }, { status: 500 });
    }

    const updatedRows = updated || [];
    const updatedIds = new Set(updatedRows.map((r) => r.id));
    const notFound = ids.filter((id) => !updatedIds.has(id));

    // Cascade onto linked bonus rows, one UPDATE per agent so the
    // (agent_id, document_id) pairing stays intact. Failures are logged but
    // never fail the request — the orders themselves are already saved.
    const docsByAgent = new Map();
    for (const row of updatedRows) {
      if (row.type !== 'order' || !row.document_id || !row.agent_id) continue;
      if (!docsByAgent.has(row.agent_id)) docsByAgent.set(row.agent_id, new Set());
      docsByAgent.get(row.agent_id).add(row.document_id);
    }

    const cascadedIds = [];
    for (const [agentId, docIds] of docsByAgent) {
      const { data: cascadedRows, error: cascadeErr } = await adminSupabase
        .from('agent_commissions')
        .update({ customer_paid_at })
        .eq('agent_id', agentId)
        .in('document_id', [...docIds])
        .eq('type', 'new_client_bonus')
        .select('id');

      if (cascadeErr) {
        console.error('[customer-paid-bulk PATCH] Cascade failed:', cascadeErr.message);
        continue;
      }
      for (const r of cascadedRows || []) cascadedIds.push(r.id);
    }

    return NextResponse.json({
      commissions: updatedRows,
      updated_count: updatedRows.length,
      not_found: notFound,
      cascaded_bonus_ids: cascadedIds,
      cascaded_bonuses: cascadedIds.length,
    });
  } catch (err) {
    console.error('[customer-paid-bulk PATCH] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
