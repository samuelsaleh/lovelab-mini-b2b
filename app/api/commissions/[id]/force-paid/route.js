/**
 * PATCH /api/commissions/[id]/force-paid
 *
 * Settles one commission by hand: status='paid' plus a paid_at stamp, without
 * going through Record Payment.
 *
 * The normal route to Paid is Paid? → Send report now → Record Payment, and
 * Record Payment settles every line on the report at once. Lines still get
 * stranded in Reported: the agent was paid outside the app, or the payment was
 * recorded against a different report than the one the line was linked to.
 * Reported rows are excluded from later reports, so Record Payment will never
 * reach them again and the commission sits there forever.
 *
 * `customer_paid_at` is stamped when it's missing, because Undo (revert-paid)
 * keeps that field to decide where the row lands: without it the row would
 * reappear as "Awaiting customer" rather than "Ready to pay".
 *
 * This deliberately does NOT write an `agent_payments` ledger entry — the
 * premise is that the money moved outside the app. Record Payment remains the
 * way to log an actual payout, and keeping the two apart means forcing a line
 * can never double-count against the agent's balance.
 *
 * Reversible with PATCH /api/commissions/[id]/revert-paid ("Undo").
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
      prefix: 'commission-force-paid',
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

    const { data: row, error: loadErr } = await adminSupabase
      .from('agent_commissions')
      .select('id, agent_id, document_id, type, status, report_id, customer_paid_at')
      .eq('id', id)
      .maybeSingle();

    if (loadErr) {
      console.error('[force-paid PATCH] Load error:', loadErr.message);
      return NextResponse.json({ error: 'Failed to load commission' }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: 'Commission not found' }, { status: 404 });

    // Plain-English refusals for the two settled states, so mom gets a reason
    // instead of a silent no-op.
    if (row.status === 'paid') {
      return NextResponse.json(
        { error: 'This commission is already paid out.' },
        { status: 409 },
      );
    }
    if (row.status === 'cancelled') {
      return NextResponse.json(
        { error: 'This commission is cancelled — it cannot be paid out.' },
        { status: 409 },
      );
    }

    const timestamp = new Date().toISOString();
    const update = { status: 'paid', paid_at: timestamp };
    // Don't overwrite a Paid? date that's already there — mom may have set it
    // weeks ago and it records when the customer settled, not when we clicked.
    if (!row.customer_paid_at) update.customer_paid_at = timestamp;

    const { data: updated, error } = await adminSupabase
      .from('agent_commissions')
      .update(update)
      .eq('id', id)
      // Same guard the report settlement uses: only unsettled rows move, so a
      // payout landing between the load and the write wins over this click.
      .in('status', ['pending', 'approved'])
      .select('id, status, paid_at, report_id, customer_paid_at, agent_id, document_id, type')
      .maybeSingle();

    if (error) {
      console.error('[force-paid PATCH] Update error:', error.message);
      return NextResponse.json({ error: 'Failed to update commission' }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json(
        { error: 'This commission was just settled somewhere else — reload the page.' },
        { status: 409 },
      );
    }

    // Cascade onto the order's new-client bonus, the way the Paid? tick and the
    // report link already do: the pair was earned together and settles
    // together. Only orders with a document lead a cascade — a manual bonus
    // with no document would otherwise match every other manual bonus row.
    // Failures here are logged, not fatal: the row she clicked is already paid.
    let cascaded = 0;
    if (updated.type === 'order' && updated.document_id && updated.agent_id) {
      const bonusFilter = () => adminSupabase
        .from('agent_commissions')
        .update({ customer_paid_at: timestamp })
        .eq('agent_id', updated.agent_id)
        .eq('document_id', updated.document_id)
        .eq('type', 'new_client_bonus')
        .in('status', ['pending', 'approved']);

      // Fill a missing Paid? date before settling, so Undo puts the bonus back
      // in "Ready to pay" next to its order instead of "Awaiting customer".
      // Guarded to rows where it is actually null, so an older date survives.
      const { error: stampErr } = await bonusFilter().is('customer_paid_at', null);
      if (stampErr) {
        console.error('[force-paid PATCH] Bonus Paid? stamp failed:', stampErr.message);
      }

      const { data: cascadedRows, error: cascadeErr } = await adminSupabase
        .from('agent_commissions')
        .update({ status: 'paid', paid_at: timestamp })
        .eq('agent_id', updated.agent_id)
        .eq('document_id', updated.document_id)
        .eq('type', 'new_client_bonus')
        .in('status', ['pending', 'approved'])
        .select('id');

      if (cascadeErr) {
        console.error('[force-paid PATCH] Cascade to bonus failed:', cascadeErr.message);
      } else {
        cascaded = cascadedRows?.length || 0;
      }
    }

    return NextResponse.json({ commission: updated, cascaded_bonuses: cascaded });
  } catch (err) {
    console.error('[force-paid PATCH] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
