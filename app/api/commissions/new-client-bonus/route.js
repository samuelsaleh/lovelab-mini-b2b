/**
 * POST /api/commissions/new-client-bonus
 *
 * Body: { agent_id: string, document_id: string }
 *
 * Grants the agent's new-client bonus for one specific order, because
 * the admin decided this client is worth it. This is the manual
 * counterpart to the automatic hook in the document save routes: in
 * 'manual' mode nothing is created on save, and a bonus only ever comes
 * into existence through this endpoint.
 *
 * The amount is not taken from the request — it always comes from the
 * agent's configured new_client_bonus_amount, so the button can't be
 * used to pay an arbitrary sum.
 *
 * Access: admin only.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { createManualBonusForOrder } from '@/lib/newClientBonus';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Why a bonus could not be created, in words the admin can act on.
const SKIP_MESSAGES = {
  feature_disabled: 'The new-client bonus is switched off for this agent.',
  no_amount: 'Set a bonus amount for this agent first.',
  no_order_commission: 'This order has no commission for this agent yet.',
  document_not_found: 'That order no longer exists.',
  document_deleted: 'That order has been deleted.',
  no_customer_key: 'This order has no company or client name to match on.',
  already_exists: 'This order already has a new-client bonus.',
  not_first_order: 'This is not the first order for this customer — the bonus was already earned earlier.',
  missing_inputs: 'Missing agent or order.',
};

export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 30,
      prefix: 'commission-new-client-bonus',
    });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminSupabase = createAdminClient();
    const { data: caller } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (caller?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const agentId = body?.agent_id;
    const documentId = body?.document_id;
    if (typeof agentId !== 'string' || !UUID_REGEX.test(agentId)) {
      return NextResponse.json({ error: 'agent_id must be a valid UUID' }, { status: 400 });
    }
    if (typeof documentId !== 'string' || !UUID_REGEX.test(documentId)) {
      return NextResponse.json({ error: 'document_id must be a valid UUID' }, { status: 400 });
    }

    const { data: agent, error: agentErr } = await adminSupabase
      .from('profiles')
      .select('id, is_agent, agent_deleted_at, new_client_bonus_mode, new_client_bonus_enabled, new_client_bonus_amount')
      .eq('id', agentId)
      .maybeSingle();
    if (agentErr) {
      console.error('[new-client-bonus POST] agent lookup error:', agentErr.message);
      return NextResponse.json({ error: 'Failed to load agent' }, { status: 500 });
    }
    if (!agent || !agent.is_agent || agent.agent_deleted_at) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const result = await createManualBonusForOrder(adminSupabase, {
      agentId,
      profile: agent,
      documentId,
    });

    if (result?.skipped) {
      return NextResponse.json(
        {
          error: SKIP_MESSAGES[result.reason] || 'Could not add the bonus.',
          reason: result.reason,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ created: true, amount: result.amount });
  } catch (err) {
    console.error('[new-client-bonus POST] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
