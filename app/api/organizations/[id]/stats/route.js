import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireOrganizationAccess } from '@/lib/organizations/authz';
import { getOrgTeamScope } from '@/app/api/_lib/access';
import { aggregateTeamStats, buildRevenueByEvent } from '@/lib/organizations/teamStats';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * GET /api/organizations/[id]/stats — accumulated team dashboard data.
 *
 * Visibility: every ACTIVE member of the organization (owner or member) and
 * LoveLab admins see the SAME stats, including the per-member breakdown.
 * Outsiders get 403 (via requireOrganizationAccess).
 *
 * The aggregation rules live in lib/organizations/teamStats.js (pure,
 * unit-tested); this route only fetches the inputs.
 *
 * Optional query params: from=YYYY-MM-DD, to=YYYY-MM-DD (created_at window).
 */

const REVENUE_CHANNEL_EXCLUSIONS = '("internal","consignment","delete_from_stock","sample")';
const PAGE_SIZE = 1000;

function isValidDateParam(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function fetchAllTeamDocuments(adminSupabase, { memberIds, eventIds, from, to }) {
  const orParts = [];
  if (memberIds.length > 0) orParts.push(`created_by.in.(${memberIds.join(',')})`);
  if (eventIds.length > 0) orParts.push(`event_id.in.(${eventIds.join(',')})`);
  if (orParts.length === 0) return [];

  const docs = [];
  let pageStart = 0;
  // Page through everything — team histories can exceed the 1000-row cap.
  for (;;) {
    let query = adminSupabase
      .from('documents')
      .select('id, created_by, event_id, document_type, status, order_channel, total_amount, created_at, deleted_at')
      .or(orParts.join(','))
      .is('deleted_at', null)
      .neq('status', 'draft')
      .not('order_channel', 'in', REVENUE_CHANNEL_EXCLUSIONS)
      .order('created_at', { ascending: false })
      .range(pageStart, pageStart + PAGE_SIZE - 1);

    if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);

    const { data, error } = await query;
    if (error) throw error;
    docs.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    pageStart += PAGE_SIZE;
  }
  return docs;
}

export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'org-stats' });
    if (rateLimitRes) return rateLimitRes;

    const organizationId = (await params)?.id;
    const supabase = await createClient();
    const session = await requireOrganizationAccess(supabase, organizationId);
    if (session.error) return session.error;

    const adminSupabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const from = isValidDateParam(searchParams.get('from')) ? searchParams.get('from') : null;
    const to = isValidDateParam(searchParams.get('to')) ? searchParams.get('to') : null;

    const [{ data: organization, error: orgErr }, { data: memberships, error: memberErr }] = await Promise.all([
      adminSupabase
        .from('organizations')
        .select('id, name, territory, commission_rate')
        .eq('id', organizationId)
        .is('deleted_at', null)
        .single(),
      adminSupabase
        .from('organization_memberships')
        .select('user_id, role, created_at, deleted_at, profiles:user_id(id, full_name, email, agent_status)')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true }),
    ]);
    if (orgErr || !organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }
    if (memberErr) throw memberErr;

    const scope = await getOrgTeamScope(adminSupabase, organizationId);

    // Map legacy (email-reconciled) creator ids back to their canonical
    // member entry so re-invited agents keep a single row.
    const legacyToCanonical = new Map();
    const memberUserIds = new Set((memberships || []).map((m) => m.user_id));
    const legacyIds = scope.memberIds.filter((id) => !memberUserIds.has(id));
    if (legacyIds.length > 0) {
      const { data: legacyProfiles } = await adminSupabase
        .from('profiles')
        .select('id, email')
        .in('id', legacyIds);
      const emailToCanonical = new Map();
      for (const m of memberships || []) {
        const email = String(m.profiles?.email || '').trim().toLowerCase();
        if (email && !emailToCanonical.has(email)) emailToCanonical.set(email, m.user_id);
      }
      for (const p of legacyProfiles || []) {
        const email = String(p.email || '').trim().toLowerCase();
        if (email && emailToCanonical.has(email)) {
          legacyToCanonical.set(p.id, emailToCanonical.get(email));
        }
      }
    }

    const documents = await fetchAllTeamDocuments(adminSupabase, {
      memberIds: scope.memberIds,
      eventIds: scope.eventIds,
      from,
      to,
    });

    let commissions = [];
    if (scope.memberIds.length > 0) {
      let commQuery = adminSupabase
        .from('agent_commissions')
        .select('agent_id, commission_amount, status, created_at')
        .in('agent_id', scope.memberIds);
      if (from) commQuery = commQuery.gte('created_at', `${from}T00:00:00.000Z`);
      if (to) commQuery = commQuery.lte('created_at', `${to}T23:59:59.999Z`);
      const { data: commRows, error: commErr } = await commQuery;
      if (commErr) throw commErr;
      commissions = commRows || [];
    }

    const { totals, perMember, eventBuckets } = aggregateTeamStats({
      memberships: memberships || [],
      documents,
      commissions,
      legacyToCanonical,
    });

    // Event names for the revenue-by-event chart
    let revenueByEvent = [];
    if (eventBuckets.size > 0) {
      const { data: events } = await adminSupabase
        .from('events')
        .select('id, name')
        .in('id', [...eventBuckets.keys()]);
      revenueByEvent = buildRevenueByEvent(
        eventBuckets,
        new Map((events || []).map((e) => [e.id, e.name]))
      );
    }

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        territory: organization.territory,
        commission_rate: organization.commission_rate,
      },
      totals,
      per_member: perMember,
      revenue_by_event: revenueByEvent,
      period: { from, to },
    });
  } catch (err) {
    console.error('[org-stats GET]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to load organization stats' }, { status: 500 });
  }
}
