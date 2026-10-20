/**
 * GET /api/commission-reports
 *
 * List past commission report runs. Used by:
 *   - The agent detail page "Reports" tab (filtered by agent_id).
 *   - The admin overview / debugging.
 *
 * Query params (all optional):
 *   ?agent_id=<uuid>          filter by agent
 *   ?organization_id=<uuid>   admin only — the organization's own reports
 *                             (Phase 31). Org reports are keyed to the owner
 *                             and tagged in their snapshot; this returns only
 *                             those, never the owner's personal reports.
 *   ?month=<YYYY-MM>          filter by period_key
 *   ?limit=<n>                page size, default 50, max 200
 *
 * Returns:
 *   { reports: [{ id, agent_id, period_label, period_key, total_due,
 *                 status, email_sent_at, email_recipient,
 *                 drive_view_link, storage_path,
 *                 trigger_source, created_at }, ...] }
 *
 * Access:
 *   - Admins   → can list any agent's reports (filter via ?agent_id=).
 *   - Agents   → can only list THEIR OWN reports. The agent_id filter is
 *                forced to their own user.id; an attempt to read another
 *                agent's reports returns an empty list (no leak, no 403).
 */

import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { resolveAgentIds } from '@/app/api/_lib/access';
import { reportOrganizationId } from '@/lib/organizations/settlementScope';

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
      .select('role, is_agent')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';
    const isAgent = profile?.is_agent === true;
    if (!isAdmin && !isAgent) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const agentIdParam = searchParams.get('agent_id');
    const organizationIdParam = isAdmin ? searchParams.get('organization_id') : null;
    const month = searchParams.get('month');
    const limitRaw = Number(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(Math.floor(limitRaw) || 50, 1), 200);

    if (agentIdParam && !UUID_REGEX.test(agentIdParam)) {
      return NextResponse.json({ error: 'agent_id must be UUID' }, { status: 400 });
    }
    if (organizationIdParam && !UUID_REGEX.test(organizationIdParam)) {
      return NextResponse.json({ error: 'organization_id must be UUID' }, { status: 400 });
    }
    if (month && !MONTH_REGEX.test(month)) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
    }

    // Agents are confined to their own reports. We resolve all profile IDs
    // sharing the same email (handles re-invited agents) so a fresh re-add
    // still surfaces the historical reports.
    let agentIdFilter = null;
    if (organizationIdParam) {
      // Org reports live under the owner's profile. No owner → nothing to list.
      const { data: ownerRow, error: ownerErr } = await adminSupabase
        .from('organization_memberships')
        .select('user_id')
        .eq('organization_id', organizationIdParam)
        .eq('role', 'owner')
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (ownerErr) {
        console.error('[commission-reports GET] owner lookup error:', ownerErr.message);
        return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
      }
      if (!ownerRow?.user_id) return NextResponse.json({ reports: [] });
      agentIdFilter = ownerRow.user_id;
    } else if (isAdmin) {
      agentIdFilter = agentIdParam || null;
    } else {
      agentIdFilter = user.id;
    }

    // The organization tag is only read in org mode; the JSON path keeps the
    // whole snapshot (every order row) out of the response.
    const selectCols = organizationIdParam
      ? `${SELECT_COLS}, organization:snapshot_data->organization`
      : SELECT_COLS;

    let q = adminSupabase
      .from('commission_reports')
      .select(selectCols)
      .order('created_at', { ascending: false })
      .limit(organizationIdParam ? 200 : limit);

    if (agentIdFilter) {
      const allIds = await resolveAgentIds(adminSupabase, agentIdFilter);
      q = allIds.length === 1 ? q.eq('agent_id', allIds[0]) : q.in('agent_id', allIds);
    }
    if (month) q = q.eq('period_key', month);

    const { data, error } = await q;
    if (error) {
      console.error('[commission-reports GET] error:', error.message);
      return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
    }

    let reports = data || [];
    if (organizationIdParam) {
      // Keep the owner's org reports, drop their personal (pre-org) ones.
      reports = reports
        .filter((r) => reportOrganizationId(r) === organizationIdParam)
        .slice(0, limit)
        .map(({ organization, ...rest }) => ({ ...rest, organization_id: organization?.id || null }));
    }

    return NextResponse.json({ reports });
  } catch (err) {
    console.error('[commission-reports GET] exception:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
