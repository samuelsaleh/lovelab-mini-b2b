/**
 * PATCH /api/commissions/[id]/revert-paid
 *
 * Reverts a commission that was marked PAID (status='paid', set when a report
 * is sent via lib/commissionPaidOut.js) back to 'pending' and clears paid_at.
 * `customer_paid_at` is intentionally preserved, so the row returns to the
 * "Ready to pay" bucket and re-enters the next monthly payout.
 *
 * Use case: an admin marked a payout as done ("Send report now") but didn't
 * actually pay the agent — this puts the commission back in the pool.
 *
 * Note: this does NOT delete the historical commission_reports row or any
 * agent_payments ledger entry; it only re-opens the commission for payout.
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
      prefix: 'commission-revert-paid',
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

    // Only revert rows that are currently paid out. Keep customer_paid_at so the
    // row lands back in "Ready to pay" rather than "Awaiting customer".
    const { data: updated, error } = await adminSupabase
      .from('agent_commissions')
      .update({ status: 'pending', paid_at: null })
      .eq('id', id)
      .eq('status', 'paid')
      .select('id, status, paid_at, customer_paid_at, agent_id, document_id, type')
      .maybeSingle();

    if (error) {
      console.error('[revert-paid PATCH] Error:', error.message);
      return NextResponse.json({ error: 'Failed to update commission' }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: 'Commission not found or not paid' }, { status: 404 });
    }

    // Cascade: reverting an order's payout should also re-open its linked
    // new_client_bonus row (same agent + document) so the order/bonus pair
    // stays consistent — mirrors the customer-paid cascade. Only orders with a
    // document_id lead a cascade (manual bonuses with no document would
    // otherwise match every other manual-bonus row). Cascade failures are
    // logged but do NOT fail the request.
    let cascaded = 0;
    if (updated.type === 'order' && updated.document_id && updated.agent_id) {
      const { data: cascadedRows, error: cascadeErr } = await adminSupabase
        .from('agent_commissions')
        .update({ status: 'pending', paid_at: null })
        .eq('agent_id', updated.agent_id)
        .eq('document_id', updated.document_id)
        .eq('type', 'new_client_bonus')
        .eq('status', 'paid')
        .select('id');

      if (cascadeErr) {
        console.error('[revert-paid PATCH] Cascade to bonus failed:', cascadeErr.message);
      } else {
        cascaded = cascadedRows?.length || 0;
      }
    }

    return NextResponse.json({ commission: updated, cascaded_bonuses: cascaded });
  } catch (err) {
    console.error('[revert-paid PATCH] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
