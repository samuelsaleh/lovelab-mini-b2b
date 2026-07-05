import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateTeamStats,
  buildRevenueByEvent,
  isCountableTeamDocument,
  EXCLUDED_ORDER_CHANNELS,
} from '../../lib/organizations/teamStats.js';

const owner = {
  user_id: 'owner-1',
  role: 'owner',
  deleted_at: null,
  profiles: { full_name: 'Sarah Dupont', email: 'sarah@partner.fr', agent_status: 'active' },
};
const member = {
  user_id: 'member-1',
  role: 'member',
  deleted_at: null,
  profiles: { full_name: 'Luc Martin', email: 'luc@partner.fr', agent_status: 'active' },
};
const removedMember = {
  user_id: 'gone-1',
  role: 'member',
  deleted_at: '2026-06-01',
  profiles: { full_name: 'Ancien Agent', email: 'ancien@partner.fr', agent_status: 'paused' },
};

function order(created_by, total_amount, extra = {}) {
  return { id: Math.random().toString(36), created_by, document_type: 'order', status: 'sent', order_channel: 'b2b', total_amount, ...extra };
}

// ─────────────────────────────────────────────────────────────────────────────
// Document countability (drafts / trash / excluded channels)
// ─────────────────────────────────────────────────────────────────────────────

test('drafts are never counted (like DocumentsAnalytics)', () => {
  assert.equal(isCountableTeamDocument(order('u', 100, { status: 'draft' })), false);
});

test('trashed documents are never counted', () => {
  assert.equal(isCountableTeamDocument(order('u', 100, { deleted_at: '2026-01-01' })), false);
});

test('internal / consignment / write-off / sample channels are excluded', () => {
  for (const channel of EXCLUDED_ORDER_CHANNELS) {
    assert.equal(isCountableTeamDocument(order('u', 100, { order_channel: channel })), false, channel);
  }
  assert.equal(isCountableTeamDocument(order('u', 100, { order_channel: 'b2b' })), true);
  assert.equal(isCountableTeamDocument(order('u', 100, { order_channel: 'b2c' })), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation math
// ─────────────────────────────────────────────────────────────────────────────

test('totals: revenue sums orders only, quotes counted separately', () => {
  const { totals } = aggregateTeamStats({
    memberships: [owner, member],
    documents: [
      order('owner-1', 1000),
      order('member-1', 500.5),
      { created_by: 'member-1', document_type: 'quote', status: 'sent', total_amount: 9999 },
    ],
  });
  assert.equal(totals.revenue, 1500.5);
  assert.equal(totals.orders, 2);
  assert.equal(totals.quotes, 1);
  assert.equal(totals.active_members, 2);
});

test('per-member split attributes revenue to the right member, sorted desc', () => {
  const { perMember } = aggregateTeamStats({
    memberships: [owner, member],
    documents: [order('owner-1', 200), order('member-1', 800), order('member-1', 100)],
  });
  assert.equal(perMember[0].user_id, 'member-1');
  assert.equal(perMember[0].revenue, 900);
  assert.equal(perMember[0].orders, 2);
  assert.equal(perMember[1].user_id, 'owner-1');
  assert.equal(perMember[1].revenue, 200);
});

test('draft and excluded-channel documents do not pollute totals', () => {
  const { totals } = aggregateTeamStats({
    memberships: [owner],
    documents: [
      order('owner-1', 100),
      order('owner-1', 999, { status: 'draft' }),
      order('owner-1', 999, { order_channel: 'internal' }),
      order('owner-1', 999, { order_channel: 'consignment' }),
      order('owner-1', 999, { deleted_at: '2026-01-01' }),
    ],
  });
  assert.equal(totals.revenue, 100);
  assert.equal(totals.orders, 1);
});

test('cancelled commissions never count; pending includes pending+approved', () => {
  const { totals, perMember } = aggregateTeamStats({
    memberships: [owner],
    commissions: [
      { agent_id: 'owner-1', commission_amount: 50, status: 'pending' },
      { agent_id: 'owner-1', commission_amount: 30, status: 'approved' },
      { agent_id: 'owner-1', commission_amount: 20, status: 'paid' },
      { agent_id: 'owner-1', commission_amount: 999, status: 'cancelled' },
    ],
  });
  assert.equal(totals.total_commission, 100);
  assert.equal(totals.pending_commission, 80);
  assert.equal(perMember[0].commission, 100);
});

test('legacy (re-invited) profile ids merge into the canonical member row', () => {
  const { perMember } = aggregateTeamStats({
    memberships: [owner],
    documents: [order('owner-1', 100), order('old-owner-id', 250)],
    commissions: [{ agent_id: 'old-owner-id', commission_amount: 10, status: 'paid' }],
    legacyToCanonical: new Map([['old-owner-id', 'owner-1']]),
  });
  assert.equal(perMember.length, 1);
  assert.equal(perMember[0].revenue, 350);
  assert.equal(perMember[0].orders, 2);
  assert.equal(perMember[0].commission, 10);
});

test('removed member with history stays in totals, flagged is_removed', () => {
  const { totals, perMember } = aggregateTeamStats({
    memberships: [owner, removedMember],
    documents: [order('owner-1', 100), order('gone-1', 400)],
  });
  assert.equal(totals.revenue, 500, 'historical docs stay in the team totals');
  assert.equal(totals.active_members, 1, 'removed member no longer counts as active');
  const gone = perMember.find((m) => m.user_id === 'gone-1');
  assert.ok(gone);
  assert.equal(gone.is_removed, true);
  assert.equal(gone.revenue, 400);
});

test('removed member with zero activity is dropped from the breakdown', () => {
  const { perMember } = aggregateTeamStats({
    memberships: [owner, removedMember],
    documents: [order('owner-1', 100)],
  });
  assert.ok(!perMember.some((m) => m.user_id === 'gone-1'));
});

test('documents from complete strangers count in totals but not per-member', () => {
  // e.g. a doc filed into an org event by a non-member — totals include it
  const { totals, perMember } = aggregateTeamStats({
    memberships: [owner],
    documents: [order('stranger-1', 100, { event_id: 'e1' })],
  });
  assert.equal(totals.revenue, 100);
  assert.ok(!perMember.some((m) => m.user_id === 'stranger-1'));
});

test('rounding: totals and member revenue rounded to cents', () => {
  const { totals, perMember } = aggregateTeamStats({
    memberships: [owner],
    documents: [order('owner-1', 10.111), order('owner-1', 10.222)],
  });
  assert.equal(totals.revenue, 20.33);
  assert.equal(perMember[0].revenue, 20.33);
});

test('identical output regardless of who asks — the aggregation has no role input', () => {
  const inputs = {
    memberships: [owner, member],
    documents: [order('owner-1', 100), order('member-1', 300)],
    commissions: [{ agent_id: 'member-1', commission_amount: 30, status: 'pending' }],
  };
  // Same inputs → same stats. There is no caller/role parameter at all, so an
  // owner and a plain member of the same org receive identical numbers,
  // including the per-member breakdown.
  const a = aggregateTeamStats(inputs);
  const b = aggregateTeamStats(inputs);
  assert.deepEqual(
    { totals: a.totals, perMember: a.perMember },
    { totals: b.totals, perMember: b.perMember }
  );
  assert.equal(a.perMember.length, 2);
});

test('empty org returns zeroed stats', () => {
  const { totals, perMember } = aggregateTeamStats({});
  assert.deepEqual(totals, {
    revenue: 0, orders: 0, quotes: 0, active_members: 0,
    total_commission: 0, pending_commission: 0,
  });
  assert.deepEqual(perMember, []);
});

// ─────────────────────────────────────────────────────────────────────────────
// Revenue by event
// ─────────────────────────────────────────────────────────────────────────────

test('revenue by event: buckets, names and desc sort', () => {
  const { eventBuckets } = aggregateTeamStats({
    memberships: [owner, member],
    documents: [
      order('owner-1', 100, { event_id: 'e1' }),
      order('member-1', 900, { event_id: 'e2' }),
      order('member-1', 50, { event_id: 'e1' }),
      order('member-1', 10), // no event — not in any bucket
    ],
  });
  const byEvent = buildRevenueByEvent(eventBuckets, new Map([['e1', 'Paris Fair'], ['e2', 'Lyon Fair']]));
  assert.equal(byEvent.length, 2);
  assert.deepEqual(byEvent[0], { event_id: 'e2', revenue: 900, orders: 1, name: 'Lyon Fair' });
  assert.deepEqual(byEvent[1], { event_id: 'e1', revenue: 150, orders: 2, name: 'Paris Fair' });
});

test('revenue by event: unknown events get a placeholder name', () => {
  const { eventBuckets } = aggregateTeamStats({
    memberships: [owner],
    documents: [order('owner-1', 100, { event_id: 'mystery' })],
  });
  const byEvent = buildRevenueByEvent(eventBuckets);
  assert.equal(byEvent[0].name, 'Unknown');
});
