/**
 * DELETE /api/commissions/[id]
 *
 * Permanently removes a manually-entered commission row from the agent's
 * history: quick orders (type='order', document_id=NULL) and ad-hoc bonuses
 * (type='bonus', document_id=NULL) that have not been reported or paid out.
 *
 * Order-linked, reported, and paid rows are protected because deleting them
 * would sever the commission/report/payment audit trail and can allow the same
 * order to be settled again after a re-save.
 *
 * Access: admin only.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_INVOICE_LEN = 100;

/**
 * PATCH /api/commissions/[id]
 *
 * Admin-only. Updates the manual `invoice_number` note on a single commission
 * row. Send `{ invoice_number: "INV-123" }`; an empty string clears it.
 */
export async function PATCH(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 60,
      prefix: 'commission-patch',
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

    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid commission id' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body || body.invoice_number === undefined) {
      return NextResponse.json({ error: 'invoice_number is required' }, { status: 400 });
    }
    if (body.invoice_number !== null && typeof body.invoice_number !== 'string') {
      return NextResponse.json({ error: 'invoice_number must be a string' }, { status: 400 });
    }

    // Normalise: trim, cap length, and store NULL when blank.
    const trimmed = (body.invoice_number || '').trim().slice(0, MAX_INVOICE_LEN);
    const value = trimmed === '' ? null : trimmed;

    const { data: updated, error: updErr } = await adminSupabase
      .from('agent_commissions')
      .update({ invoice_number: value })
      .eq('id', id)
      .select('id, invoice_number')
      .maybeSingle();

    if (updErr) {
      console.error('[Commissions PATCH] Error:', updErr.message);
      return NextResponse.json({ error: 'Failed to update commission' }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: 'Commission not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, commission: updated });
  } catch (err) {
    console.error('[Commissions PATCH] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 30,
      prefix: 'commission-delete',
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

    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid commission id' }, { status: 400 });
    }

    const { data: commission, error: lookupErr } = await adminSupabase
      .from('agent_commissions')
      .select('id, status, report_id, document_id, type')
      .eq('id', id)
      .maybeSingle();

    if (lookupErr) {
      console.error('[Commissions DELETE] Lookup error:', lookupErr.message);
      return NextResponse.json({ error: 'Failed to load commission' }, { status: 500 });
    }
    if (!commission) {
      return NextResponse.json({ error: 'Commission not found' }, { status: 404 });
    }

    const isManualBonus = commission.type === 'bonus' && !commission.document_id;
    const isManualQuickOrder = commission.type === 'order' && !commission.document_id;
    if (commission.status === 'paid' || commission.report_id || (!isManualBonus && !isManualQuickOrder)) {
      return NextResponse.json(
        { error: 'Only unpaid, unreported manual commission entries can be deleted' },
        { status: 409 },
      );
    }

    let deleteQuery = adminSupabase
      .from('agent_commissions')
      .delete()
      .eq('id', id)
      .neq('status', 'paid')
      .is('report_id', null);

    deleteQuery = isManualBonus
      ? deleteQuery.eq('type', 'bonus').is('document_id', null)
      : deleteQuery.eq('type', 'order').is('document_id', null);

    const { data: deleted, error: delErr } = await deleteQuery
      .select('id')
      .maybeSingle();

    if (delErr) {
      console.error('[Commissions DELETE] Error:', delErr.message);
      return NextResponse.json({ error: 'Failed to delete commission' }, { status: 500 });
    }
    if (!deleted) {
      return NextResponse.json(
        { error: 'Commission changed and is no longer safe to delete' },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('[Commissions DELETE] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
