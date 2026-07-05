/**
 * Pure aggregation for the team stats endpoint
 * (GET /api/organizations/[id]/stats).
 *
 * Every ACTIVE org member sees the same output, including the per-member
 * breakdown — this module only does the math; access control lives in the
 * route. Kept dependency-free so node:test exercises the real logic.
 *
 * Aggregation rules (mirrors DocumentsAnalytics / documents org filter):
 *   - drafts and trashed documents are excluded (defensively re-checked here)
 *   - internal / consignment / delete_from_stock / sample channels excluded
 *   - revenue counts document_type === 'order' only; quotes counted separately
 *   - cancelled commissions never count
 *   - removed members keep their historical revenue in the team totals
 */

export const EXCLUDED_ORDER_CHANNELS = ['internal', 'consignment', 'delete_from_stock', 'sample'];

function toNumber(value) {
  return Number(value) || 0;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Should this document count toward team stats at all? */
export function isCountableTeamDocument(doc) {
  if (!doc) return false;
  if (doc.deleted_at) return false;
  if (doc.status === 'draft') return false;
  if (doc.order_channel && EXCLUDED_ORDER_CHANNELS.includes(doc.order_channel)) return false;
  return true;
}

/**
 * @param {object} params
 * @param {Array} params.memberships - org membership rows
 *   [{ user_id, role, deleted_at, profiles: { full_name, email, agent_status } }]
 * @param {Array} params.documents - team-scoped document rows
 * @param {Array} params.commissions - agent_commissions rows for team members
 * @param {Map|object} [params.legacyToCanonical] - legacy profile id -> canonical member user_id
 * @returns {{ totals, perMember }}
 */
export function aggregateTeamStats({
  memberships = [],
  documents = [],
  commissions = [],
  legacyToCanonical = new Map(),
} = {}) {
  const legacyMap = legacyToCanonical instanceof Map
    ? legacyToCanonical
    : new Map(Object.entries(legacyToCanonical || {}));

  const memberByUserId = new Map();
  for (const m of memberships) {
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

  const canonical = (id) => legacyMap.get(id) || id;

  const totals = { revenue: 0, orders: 0, quotes: 0 };
  const eventBuckets = new Map();

  for (const doc of documents) {
    if (!isCountableTeamDocument(doc)) continue;
    const amount = toNumber(doc.total_amount);
    const member = memberByUserId.get(canonical(doc.created_by));

    if (doc.document_type === 'order') {
      totals.revenue += amount;
      totals.orders += 1;
      if (member) {
        member.revenue += amount;
        member.orders += 1;
      }
      if (doc.event_id) {
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

  let totalCommission = 0;
  let pendingCommission = 0;
  for (const row of commissions) {
    if (!row || row.status === 'cancelled') continue;
    const amount = toNumber(row.commission_amount);
    totalCommission += amount;
    if (row.status === 'pending' || row.status === 'approved') {
      pendingCommission += amount;
    }
    const member = memberByUserId.get(canonical(row.agent_id));
    if (member) member.commission += amount;
  }

  const activeMembers = memberships.filter((m) => !m.deleted_at).length;

  const perMember = [...memberByUserId.values()]
    .map((m) => ({ ...m, revenue: round2(m.revenue), commission: round2(m.commission) }))
    // Removed members with zero historical activity are noise — drop them.
    .filter((m) => !m.is_removed || m.revenue > 0 || m.orders > 0 || m.quotes > 0 || m.commission > 0)
    .sort((a, b) => b.revenue - a.revenue);

  return {
    totals: {
      revenue: round2(totals.revenue),
      orders: totals.orders,
      quotes: totals.quotes,
      active_members: activeMembers,
      total_commission: round2(totalCommission),
      pending_commission: round2(pendingCommission),
    },
    perMember,
    eventBuckets,
  };
}

/** Attach event names and sort the revenue-by-event buckets. */
export function buildRevenueByEvent(eventBuckets, eventNameById = new Map()) {
  const nameMap = eventNameById instanceof Map
    ? eventNameById
    : new Map(Object.entries(eventNameById || {}));
  return [...eventBuckets.values()]
    .map((b) => ({
      ...b,
      name: nameMap.get(b.event_id) || 'Unknown',
      revenue: round2(b.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}
