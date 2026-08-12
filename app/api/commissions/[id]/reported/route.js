/**
 * PATCH /api/commissions/[id]/reported
 *
 * Body: { reported: boolean }
 *   - true  → link the row to the agent's most recent report ("Reported")
 *   - false → unlink it, so it drops back into the pool and the next report
 *             picks it up again
 *
 * The manual override for the Paid? → Send report → Record Payment flow.
 * Report generation normally sets `report_id` itself, but a row can end up on
 * the wrong side of it: swept into a report before the Paid? tick existed, or
 * left behind when a send went wrong. Once `report_id` is set the row is
 * excluded from every future report, so without a way to clear it by hand the
 * commission is stuck forever.
 *
 * Marking a row reported also stamps `customer_paid_at` when it's missing:
 * a line that went out on a report is a line whose customer paid, and the
 * payout screens read that field.
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
      prefix: 'commission-reported',
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
    if (typeof body?.reported !== 'boolean') {
      return NextResponse.json({ error: 'reported must be a boolean' }, { status: 400 });
    }

    const { data: row, error: loadErr } = await adminSupabase
      .from('agent_commissions')
      .select('id, agent_id, document_id, type, status, report_id, customer_paid_at')
      .eq('id', id)
      .maybeSingle();

    if (loadErr) {
      console.error('[reported PATCH] Load error:', loadErr.message);
      return NextResponse.json({ error: 'Failed to load commission' }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: 'Commission not found' }, { status: 404 });

    // Plain-English refusals: these two states are settled, and quietly
    // re-linking them would desync the payment that already happened.
    if (row.status === 'paid') {
      return NextResponse.json(
        { error: 'This commission is already paid out. Undo the payout first.' },
        { status: 409 },
      );
    }
    if (row.status === 'cancelled') {
      return NextResponse.json(
        { error: 'This commission is cancelled.' },
        { status: 409 },
      );
    }

    const update = {};
    let report = null;

    if (body.reported) {
      const { data: latest, error: reportErr } = await adminSupabase
        .from('commission_reports')
        .select('id, period_label, period_key, created_at')
        .eq('agent_id', row.agent_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reportErr) {
        console.error('[reported PATCH] Report lookup error:', reportErr.message);
        return NextResponse.json({ error: 'Failed to find the last report' }, { status: 500 });
      }
      if (!latest) {
        return NextResponse.json(
          { error: 'This agent has no report yet — send a report first.' },
          { status: 409 },
        );
      }

      report = latest;
      update.report_id = latest.id;
      // Being on a report implies the customer paid; don't overwrite a date
      // that's already there, mom may have set it weeks ago.
      if (!row.customer_paid_at) update.customer_paid_at = new Date().toISOString();
    } else {
      update.report_id = null;
    }

    const { data: updated, error } = await adminSupabase
      .from('agent_commissions')
      .update(update)
      .eq('id', id)
      .select('id, status, report_id, customer_paid_at, agent_id, document_id, type')
      .maybeSingle();

    if (error) {
      console.error('[reported PATCH] Update error:', error.message);
      return NextResponse.json({ error: 'Failed to update commission' }, { status: 500 });
    }
    if (!updated) return NextResponse.json({ error: 'Commission not found' }, { status: 404 });

    // Cascade onto the order's new-client bonus, the same way the Paid? tick
    // does — the pair belongs on one report, and mom shouldn't have to think
    // about the bonus line separately. A failure here is logged, not fatal:
    // the row she clicked is already updated and she has her feedback.
    let cascaded = 0;
    if (updated.type === 'order' && updated.document_id && updated.agent_id) {
      const { data: cascadedRows, error: cascadeErr } = await adminSupabase
        .from('agent_commissions')
        .update(update)
        .eq('agent_id', updated.agent_id)
        .eq('document_id', updated.document_id)
        .eq('type', 'new_client_bonus')
        .in('status', ['pending', 'approved'])
        .select('id');

      if (cascadeErr) {
        console.error('[reported PATCH] Cascade to bonus failed:', cascadeErr.message);
      } else {
        cascaded = cascadedRows?.length || 0;
      }
    }

    return NextResponse.json({ commission: updated, report, cascaded_bonuses: cascaded });
  } catch (err) {
    console.error('[reported PATCH] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
