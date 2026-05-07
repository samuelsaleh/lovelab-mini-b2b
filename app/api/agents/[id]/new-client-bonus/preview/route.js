/**
 * GET /api/agents/[id]/new-client-bonus/preview?amount=200
 *
 * Returns the list of distinct historical customers this agent has
 * brought in, the EUR amount each would receive at the supplied bonus
 * rate, and the total commitment. Used by NewClientBonusModal to show
 * Sam exactly what he's about to credit before he confirms.
 *
 * Read-only — does not write anything.
 *
 * Access: admin only.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { previewBackfill } from '@/lib/newClientBonus';

export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 30,
      prefix: 'bonus-preview',
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

    const url = new URL(request.url);
    const amountParam = url.searchParams.get('amount');
    const amount = Number(amountParam);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json(
        { error: 'amount must be a non-negative number' },
        { status: 400 },
      );
    }

    const result = await previewBackfill(adminSupabase, agentId, amount);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[bonus preview GET] Exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
