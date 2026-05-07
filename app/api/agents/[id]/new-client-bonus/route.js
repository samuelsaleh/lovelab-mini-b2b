/**
 * PATCH /api/agents/[id]/new-client-bonus
 *
 * Body:
 *   {
 *     enabled: boolean,
 *     amount: number | null,
 *     runBackfill?: boolean   // default true when enabling
 *   }
 *
 * Saves the agent's new_client_bonus_enabled + new_client_bonus_amount
 * settings. When enabling, retroactively creates one new_client_bonus
 * commission row per distinct historical customer the agent has
 * already brought in (via lib/newClientBonus.executeBackfill).
 *
 * Disable behaviour: existing bonus rows are LEFT UNTOUCHED. Once a
 * bonus is earned it stays earned. Future orders simply won't trigger
 * new ones.
 *
 * Access: admin only.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { executeBackfill } from '@/lib/newClientBonus';
import { recordHealthEvent } from '@/lib/healthEvent';

export async function PATCH(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 10,
      prefix: 'bonus-patch',
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

    const { id: agentId } = await params;
    if (!agentId) {
      return NextResponse.json({ error: 'Missing agent id' }, { status: 400 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const enabled = body?.enabled === true;
    const rawAmount = body?.amount;
    const amount =
      rawAmount === null || rawAmount === undefined || rawAmount === ''
        ? null
        : Number(rawAmount);

    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      return NextResponse.json(
        { error: 'amount must be a non-negative number or null' },
        { status: 400 },
      );
    }
    if (enabled && (amount === null || amount <= 0)) {
      return NextResponse.json(
        { error: 'Cannot enable bonus without a positive amount' },
        { status: 400 },
      );
    }

    // Verify the target is an active agent that hasn't been soft-deleted.
    const { data: target, error: targetErr } = await adminSupabase
      .from('profiles')
      .select('id, is_agent, agent_deleted_at, full_name, email')
      .eq('id', agentId)
      .maybeSingle();
    if (targetErr) {
      console.error('[bonus PATCH] target lookup error:', targetErr.message);
      return NextResponse.json({ error: 'Failed to load agent' }, { status: 500 });
    }
    if (!target || !target.is_agent || target.agent_deleted_at) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Persist the toggle + amount FIRST so subsequent maybeCreateBonusForOrder
    // calls (from the order-save hook) see the new state immediately even if
    // the backfill below crashes.
    const { error: updateErr } = await adminSupabase
      .from('profiles')
      .update({
        new_client_bonus_enabled: enabled,
        new_client_bonus_amount: amount,
      })
      .eq('id', agentId);
    if (updateErr) {
      console.error('[bonus PATCH] update error:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to save bonus settings' },
        { status: 500 },
      );
    }

    // Backfill only runs when ENABLING with a positive amount AND the
    // caller didn't explicitly opt out via runBackfill: false.
    let backfill = { created: 0, total: 0, rows: [] };
    const shouldBackfill =
      enabled && amount > 0 && body?.runBackfill !== false;
    if (shouldBackfill) {
      try {
        backfill = await executeBackfill(adminSupabase, agentId, amount);
      } catch (err) {
        // The settings are saved; only the backfill failed. Surface the
        // error to the caller and record it so we don't lose the signal.
        await recordHealthEvent({
          source: 'bonus_backfill_route',
          severity: 'error',
          message: err?.message || 'executeBackfill threw',
          context: { agent_id: agentId, amount },
        });
        return NextResponse.json(
          {
            error: 'Settings saved but backfill failed',
            detail: err?.message || 'unknown',
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      agent: {
        id: agentId,
        new_client_bonus_enabled: enabled,
        new_client_bonus_amount: amount,
      },
      backfill,
    });
  } catch (err) {
    console.error('[bonus PATCH] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
