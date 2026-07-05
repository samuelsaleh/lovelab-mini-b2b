import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireOrganizationAccess } from '@/lib/organizations/authz';
import { getOrgTeamScope } from '@/app/api/_lib/access';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * GET /api/organizations/[id]/stats — accumulated team dashboard data.
 *
 * Visibility: every ACTIVE member of the organization (owner or member) and
 * LoveLab admins see the SAME stats, including the per-member breakdown.
 * Outsiders get 403 (via requireOrganizationAccess).
 *
 * Aggregation rules (mirrors DocumentsAnalytics / the documents org filter):
 *   - team documents = created_by IN team member ids (current + historical)
 *     OR event_id IN the org's linked events
 *   - drafts excluded, trashed excluded
 *   - internal / consignment / delete_from_stock / sample channels excluded
 *   - revenue counts document_type = 'order' only; quotes counted separately
 *
 * Optional query params: from=YYYY-MM-DD, to=YYYY-MM-DD (created_at window).
 */

const REVENUE_CHANNEL_EXCLUSIONS = '("internal","consignment","delete_from_stock","sample")';
const PAGE_SIZE = 1000;

function toNumber(value) {
  return Number(value) || 0;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

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
      .select('id, created_by, event_id, document_type, status, order_channel, total_amount, created_at')
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

    const activeMemberships = (memberships || []).filter((m) => !m.deleted_at);
    const scope = await getOrgTeamScope(adminSupabase, organizationId);

    // Canonical member entry per membership row (removed members flagged so
    // their historical revenue stays visible in the team totals).
    const memberByUserId = new Map();
    for (const m of memberships || []) {
      memberByUserId.set(m.user_id, {
        user_id: m.user_id,
        full_name: m.profiles?.full_name || '',
        email: m.profiles?.email || '',
        role: m.role,
        agent_status: m.profiles?.agent_status || null,
        is_removed: Boolean(m.deleted_at),
        revenue: 0,
        orders: 0,
        quotes: 0,
        commission: 0,
      });
    }

    // Map legacy (email-reconciled) creator ids back to their canonical
    // member entry so re-invited agents keep a single row.
    const legacyToCanonical = new Map();
    const legacyIds = scope.memberIds.filter((id) => !memberByUserId.has(id));
    if (legacyIds.length > 0) {
      const { data: legacyProfiles } = await adminSupabase
        .from('profiles')
        .select('id, email')
        .in('id', legacyIds);
      const emailToCanonical = new Map();
      for (const [userId, member] of memberByUserId) {
        const email = String(member.email || '').trim().toLowerCase();
        if (email && !emailToCanonical.has(email)) emailToCanonical.set(email, userId);
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

    const totals = { revenue: 0, orders: 0, quotes: 0 };
    const eventBuckets = new Map();
    const seenEventIds = new Set();

    for (const doc of documents) {
      const amount = toNumber(doc.total_amount);
      const canonicalId = legacyToCanonical.get(doc.created_by) || doc.created_by;
      const member = memberByUserId.get(canonicalId);

      if (doc.document_type === 'order') {
        totals.revenue += amount;
        totals.orders += 1;
        if (member) {
          member.revenue += amount;
          member.orders += 1;
        }
        if (doc.event_id) {
          seenEventIds.add(doc.event_id);
          const bucket = eventBuckets.get(doc.event_id) || { event_id: doc.event_id, revenue: 0, orders: 0 };
          bucket.revenue += amount;
          bucket.orders += 1;
          eventBuckets.set(doc.event_id, bucket);
        }
      } else {
        totals.quotes += 1;
        if (member) member.quotes += 1;
      }
    }

    // Commission totals per member (non-cancelled), matching the org ledger.
    let totalCommission = 0;
    let pendingCommission = 0;
    if (scope.memberIds.length > 0) {
      let commQuery = adminSupabase
        .from('agent_commissions')
        .select('agent_id, commission_amount, status, created_at')
        .in('agent_id', scope.memberIds);
      if (from) commQuery = commQuery.gte('created_at', `${from}T00:00:00.000Z`);
      if (to) commQuery = commQuery.lte('created_at', `${to}T23:59:59.999Z`);
      const { data: commissions, error: commErr } = await commQuery;
      if (commErr) throw commErr;

      for (const row of commissions || []) {
        if (row.status === 'cancelled') continue;
        const amount = toNumber(row.commission_amount);
        totalCommission += amount;
        if (row.status === 'pending' || row.status === 'approved') {
          pendingCommission += amount;
        }
        const canonicalId = legacyToCanonical.get(row.agent_id) || row.agent_id;
        const member = memberByUserId.get(canonicalId);
        if (member) member.commission += amount;
      }
    }

    // Event names for the revenue-by-event chart
    let revenueByEvent = [];
    if (seenEventIds.size > 0) {
      const { data: events } = await adminSupabase
        .from('events')
        .select('id, name')
        .in('id', [...seenEventIds]);
      const nameById = new Map((events || []).map((e) => [e.id, e.name]));
      revenueByEvent = [...eventBuckets.values()]
        .map((b) => ({
          ...b,
          name: nameById.get(b.event_id) || 'Unknown',
          revenue: round2(b.revenue),
        }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    const perMember = [...memberByUserId.values()]
      .map((m) => ({ ...m, revenue: round2(m.revenue), commission: round2(m.commission) }))
      // Removed members with no activity are noise — drop them.
      .filter((m) => !m.is_removed || m.revenue > 0 || m.orders > 0 || m.quotes > 0 || m.commission > 0)
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        territory: organization.territory,
        commission_rate: organization.commission_rate,
      },
      totals: {
        revenue: round2(totals.revenue),
        orders: totals.orders,
        quotes: totals.quotes,
        active_members: activeMemberships.length,
        total_commission: round2(totalCommission),
        pending_commission: round2(pendingCommission),
      },
      per_member: perMember,
      revenue_by_event: revenueByEvent,
      period: { from, to },
    });
  } catch (err) {
    console.error('[org-stats GET]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to load organization stats' }, { status: 500 });
  }
}
