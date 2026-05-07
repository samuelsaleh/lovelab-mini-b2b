/**
 * GET /api/commission-reports
 *
 * List past commission report runs. Used by:
 *   - The agent detail page "Reports" tab (filtered by agent_id).
 *   - The admin overview / debugging.
 *
 * Query params (all optional):
 *   ?agent_id=<uuid>   filter by agent
 *   ?month=<YYYY-MM>   filter by period_key
 *   ?limit=<n>         page size, default 50, max 200
 *
 * Returns:
 *   { reports: [{ id, agent_id, period_label, period_key, total_due,
 *                 status, email_sent_at, email_recipient,
 *                 drive_view_link, storage_path,
 *                 trigger_source, created_at }, ...] }
 *
 * Access: admin only.
 */

import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_REGEX = /^\d{4}-\d{2}$/;

const SELECT_COLS = [
  'id',
  'agent_id',
  'period_start',
  'period_end',
  'period_label',
  'period_key',
  'total_due',
  'order_count',
  'bonus_count',
  'loose_b2c_count',
  'storage_path',
  'drive_file_id',
  'drive_view_link',
  'email_recipient',
  'email_sent_at',
  'email_message_id',
  'email_error',
  'status',
  'trigger_source',
  'created_at',
].join(', ');

export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, {
      maxRequests: 60,
      prefix: 'commission-reports-list',
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

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');
    const month = searchParams.get('month');
    const limitRaw = Number(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(Math.floor(limitRaw) || 50, 1), 200);

    if (agentId && !UUID_REGEX.test(agentId)) {
      return NextResponse.json({ error: 'agent_id must be UUID' }, { status: 400 });
    }
    if (month && !MONTH_REGEX.test(month)) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
    }

    let q = adminSupabase
      .from('commission_reports')
      .select(SELECT_COLS)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (agentId) q = q.eq('agent_id', agentId);
    if (month) q = q.eq('period_key', month);

    const { data, error } = await q;
    if (error) {
      console.error('[commission-reports GET] error:', error.message);
      return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
    }

    return NextResponse.json({ reports: data || [] });
  } catch (err) {
    console.error('[commission-reports GET] exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
