/**
 * PATCH /api/commissions/[id]/customer-paid
 *
 * Body: { paid: boolean }
 *   - true  → set customer_paid_at = now()
 *   - false → set customer_paid_at = null
 *
 * Tracks whether the customer has paid the underlying order. Drives the
 * READY-TO-PAY vs AWAITING-CUSTOMER split on the agent detail page and
 * decides which commissions are eligible for the monthly Excel export
 * (only customer-paid ones go in).
 *
 * Access: admin only.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 60,
      prefix: 'commission-customer-paid',
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

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (typeof body?.paid !== 'boolean') {
      return NextResponse.json(
        { error: 'paid must be a boolean' },
        { status: 400 },
      );
    }

    const customer_paid_at = body.paid ? new Date().toISOString() : null;

    const { data: updated, error } = await adminSupabase
      .from('agent_commissions')
      .update({ customer_paid_at })
      .eq('id', id)
      .select('id, customer_paid_at, status, agent_id, document_id, type')
      .maybeSingle();

    if (error) {
      console.error('[customer-paid PATCH] Error:', error.message);
      return NextResponse.json({ error: 'Failed to update commission' }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: 'Commission not found' }, { status: 404 });
    }

    // Cascade: when ticking an order's "Customer paid?" checkbox, auto-tick
    // the linked new_client_bonus row (same agent + document). This way mom
    // doesn't have to tick two boxes per customer for the bonus to flow into
    // the next monthly Excel export.
    //
    // Only cascades when:
    //   - the row we just updated is type='order' (bonuses don't trigger
    //     a cascade onto themselves or onto their order — the order is the
    //     leader of the pair)
    //   - the order has a document_id (manual bonuses with no document
    //     would otherwise match every other manual-bonus row)
    //
    // Cascade failures are logged but do NOT fail the request, because the
    // primary order update already succeeded and the user has feedback.
    let cascaded = 0;
    if (updated.type === 'order' && updated.document_id && updated.agent_id) {
      const { data: cascadedRows, error: cascadeErr } = await adminSupabase
        .from('agent_commissions')
        .update({ customer_paid_at })
        .eq('agent_id', updated.agent_id)
        .eq('document_id', updated.document_id)
        .eq('type', 'new_client_bonus')
        .select('id');

      if (cascadeErr) {
        console.error('[customer-paid PATCH] Cascade to bonus failed:', cascadeErr.message);
      } else {
        cascaded = cascadedRows?.length || 0;
      }
    }

    return NextResponse.json({ commission: updated, cascaded_bonuses: cascaded });
  } catch (err) {
    console.error('[customer-paid PATCH] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
