/**
 * PATCH /api/agents/[id]/new-client-bonus
 *
 * Body:
 *   {
 *     mode: 'off' | 'manual' | 'auto',
 *     amount: number | null,
 *     runBackfill?: boolean   // default true, only ever applies to 'auto'
 *   }
 *
 * Legacy callers may still send `enabled: boolean`, which maps to
 * 'auto' / 'off'.
 *
 * Saves the agent's bonus mode + amount. Only 'auto' retroactively
 * creates one new_client_bonus row per distinct historical customer
 * (via lib/newClientBonus.executeBackfill) — 'manual' deliberately
 * creates nothing, because there the admin decides per order.
 *
 * Switching off behaviour: existing bonus rows are LEFT UNTOUCHED. Once
 * a bonus is earned it stays earned. Future orders simply won't trigger
 * new ones.
 *
 * Access: admin only.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { executeBackfill, BONUS_MODES } from '@/lib/newClientBonus';
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

    // `mode` is authoritative; `enabled` is the pre-mode wire format.
    let mode;
    if (body?.mode !== undefined) {
      if (!BONUS_MODES.includes(body.mode)) {
        return NextResponse.json(
          { error: `mode must be one of ${BONUS_MODES.join(', ')}` },
          { status: 400 },
        );
      }
      mode = body.mode;
    } else {
      mode = body?.enabled === true ? 'auto' : 'off';
    }
    const enabled = mode !== 'off';

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
        new_client_bonus_mode: mode,
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

    // Backfill only runs for 'auto' with a positive amount AND when the
    // caller didn't explicitly opt out via runBackfill: false. 'manual'
    // never backfills — creating bonuses for the whole history is the
    // exact opposite of deciding one order at a time.
    let backfill = { created: 0, total: 0, rows: [] };
    const shouldBackfill =
      mode === 'auto' && amount > 0 && body?.runBackfill !== false;
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
        new_client_bonus_mode: mode,
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
