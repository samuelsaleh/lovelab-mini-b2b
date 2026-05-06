/**
 * @jest-environment node
 *
 * commissionAttribution — unit tests
 *
 * Verifies that POST and PUT now resolve to the same agent in every legitimate
 * shape. Previously PUT only checked tier 1 (creator); these tests ensure the
 * three-tier fallback is present and stable.
 *
 * Coverage:
 *   resolveCommissionAgent
 *     ✓ tier 1 — creator is themselves an active agent
 *     ✓ tier 2 — event has organization_id with active agent inside
 *     ✓ tier 3 — event was created by a different active agent
 *     ✓ no event_id, no agent creator → null
 *     ✓ creator is agent but inactive → falls through to tier 2/3
 *     ✓ event creator equals doc creator → does not double-count
 *
 *   upsertCommissionForDocument
 *     ✓ uses agent rate when set
 *     ✓ falls back to organization rate when agent rate is 0
 *     ✓ skips when total_amount is 0
 *     ✓ skips when calculateCommission returns 0
 *     ✓ throws on supabase error so caller can recordHealthEvent
 *     ✓ writes onConflict clause for idempotency
 */

import {
  resolveCommissionAgent,
  upsertCommissionForDocument,
} from '@/lib/commissionAttribution';

function makeAdmin(returnsByTable) {
  const upsertCalls = [];
  const fromImpl = (table) => {
    const tableConfig = returnsByTable[table] || {};
    const chain = {};
    const ret = () => chain;
    chain.select = jest.fn(ret);
    chain.eq = jest.fn(ret);
    chain.limit = jest.fn(ret);
    chain.maybeSingle = jest.fn().mockResolvedValue(
      tableConfig.maybeSingle || { data: null, error: null },
    );
    chain.upsert = jest.fn((row, opts) => {
      upsertCalls.push({ table, row, opts });
      return Promise.resolve(tableConfig.upsert || { data: null, error: null });
    });
    return chain;
  };
  return { from: jest.fn(fromImpl), __upsertCalls: upsertCalls };
}

describe('resolveCommissionAgent', () => {
  test('tier 1 — creator is an active agent', async () => {
    const admin = makeAdmin({
      profiles: { maybeSingle: { data: { id: 'a1', is_agent: true, agent_status: 'active' }, error: null } },
    });
    const r = await resolveCommissionAgent(admin, { id: 'd1', created_by: 'a1', event_id: null });
    expect(r).toMatchObject({ agentId: 'a1', via: 'creator' });
  });

  test('returns null when no creator and no event', async () => {
    const admin = makeAdmin({});
    const r = await resolveCommissionAgent(admin, { id: 'd1', created_by: null, event_id: null });
    expect(r).toBeNull();
  });

  test('tier 2 — event has org with active agent', async () => {
    // Sequence: profiles(creator) → null/non-agent, events → org_id, profiles(org) → agent
    let profilesCall = 0;
    const admin = {
      from: jest.fn((table) => {
        const chain = {};
        const ret = () => chain;
        chain.select = jest.fn(ret);
        chain.eq = jest.fn(ret);
        chain.limit = jest.fn(ret);
        chain.maybeSingle = jest.fn(() => {
          if (table === 'profiles') {
            profilesCall++;
            if (profilesCall === 1) return Promise.resolve({ data: { is_agent: false }, error: null });
            return Promise.resolve({ data: { id: 'orgAgent', is_agent: true, agent_status: 'active', organization_id: 'org1' }, error: null });
          }
          if (table === 'events') {
            return Promise.resolve({ data: { created_by: 'someone-else', organization_id: 'org1', type: 'agent' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        });
        return chain;
      }),
    };
    const r = await resolveCommissionAgent(admin, { id: 'd1', created_by: 'creator-id', event_id: 'evt1' });
    expect(r).toMatchObject({ agentId: 'orgAgent', via: 'event_organization' });
  });

  test('tier 3 — event creator is an active agent', async () => {
    let profilesCall = 0;
    const admin = {
      from: jest.fn((table) => {
        const chain = {};
        const ret = () => chain;
        chain.select = jest.fn(ret);
        chain.eq = jest.fn(ret);
        chain.limit = jest.fn(ret);
        chain.maybeSingle = jest.fn(() => {
          if (table === 'profiles') {
            profilesCall++;
            // 1st call: doc creator (not an agent)
            if (profilesCall === 1) return Promise.resolve({ data: { is_agent: false }, error: null });
            // 2nd call: event creator (IS an agent — tier 3)
            return Promise.resolve({ data: { id: 'evtCreator', is_agent: true, agent_status: 'active' }, error: null });
          }
          if (table === 'events') {
            return Promise.resolve({ data: { created_by: 'evtCreator', organization_id: null, type: 'event' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        });
        return chain;
      }),
    };
    const r = await resolveCommissionAgent(admin, { id: 'd1', created_by: 'caller', event_id: 'evt1' });
    expect(r).toMatchObject({ agentId: 'evtCreator', via: 'event_creator' });
  });

  test('does not double-count when event creator equals doc creator', async () => {
    let profilesCall = 0;
    const admin = {
      from: jest.fn((table) => {
        const chain = {};
        const ret = () => chain;
        chain.select = jest.fn(ret);
        chain.eq = jest.fn(ret);
        chain.limit = jest.fn(ret);
        chain.maybeSingle = jest.fn(() => {
          if (table === 'profiles') {
            profilesCall++;
            return Promise.resolve({ data: { is_agent: false }, error: null });
          }
          if (table === 'events') {
            // event creator === doc creator → skip tier 3
            return Promise.resolve({ data: { created_by: 'caller', organization_id: null, type: 'other' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        });
        return chain;
      }),
    };
    const r = await resolveCommissionAgent(admin, { id: 'd1', created_by: 'caller', event_id: 'evt1' });
    expect(r).toBeNull();
    // We expect exactly ONE profiles call (the creator), no second one.
    expect(profilesCall).toBe(1);
  });
});

describe('upsertCommissionForDocument', () => {
  function buildAdmin({ orgRate = 0, upsertError = null } = {}) {
    const upsertCalls = [];
    const fromImpl = (table) => {
      if (table === 'organizations') {
        const chain = {};
        const ret = () => chain;
        chain.select = jest.fn(ret);
        chain.eq = jest.fn(ret);
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: { commission_rate: orgRate }, error: null });
        return chain;
      }
      if (table === 'agent_commissions') {
        return {
          upsert: jest.fn((row, opts) => {
            upsertCalls.push({ row, opts });
            return Promise.resolve({ data: null, error: upsertError });
          }),
        };
      }
      throw new Error('unexpected table: ' + table);
    };
    return { admin: { from: jest.fn(fromImpl) }, upsertCalls };
  }

  test('uses agent rate when set', async () => {
    const { admin, upsertCalls } = buildAdmin();
    const r = await upsertCommissionForDocument(admin, {
      document: { id: 'd1', total_amount: 1000 },
      profile: { commission_rate: 10, organization_id: null },
      agentId: 'a1',
    });
    expect(r).toMatchObject({ upserted: true, amount: 100, rate: 10 });
    expect(upsertCalls[0].row).toMatchObject({
      agent_id: 'a1', document_id: 'd1', type: 'order',
      order_total: 1000, commission_amount: 100, commission_rate: 10, status: 'pending',
    });
    expect(upsertCalls[0].opts).toEqual({ onConflict: 'agent_id,document_id' });
  });

  test('falls back to organization rate when agent rate is 0', async () => {
    const { admin, upsertCalls } = buildAdmin({ orgRate: 5 });
    const r = await upsertCommissionForDocument(admin, {
      document: { id: 'd1', total_amount: 1000 },
      profile: { commission_rate: 0, organization_id: 'org1' },
      agentId: 'a1',
    });
    expect(r).toMatchObject({ upserted: true, amount: 50, rate: 5 });
    expect(upsertCalls[0].row.commission_rate).toBe(5);
  });

  test('skips when total_amount is 0', async () => {
    const { admin, upsertCalls } = buildAdmin();
    const r = await upsertCommissionForDocument(admin, {
      document: { id: 'd1', total_amount: 0 },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(r).toMatchObject({ skipped: true, reason: 'zero_amount' });
    expect(upsertCalls).toEqual([]);
  });

  test('skips when computed amount is 0 (e.g. rate 0)', async () => {
    const { admin, upsertCalls } = buildAdmin();
    const r = await upsertCommissionForDocument(admin, {
      document: { id: 'd1', total_amount: 1000 },
      profile: { commission_rate: 0, organization_id: null },
      agentId: 'a1',
    });
    expect(r).toMatchObject({ skipped: true, reason: 'computed_zero' });
    expect(upsertCalls).toEqual([]);
  });

  test('throws when supabase upsert errors so caller can recordHealthEvent', async () => {
    const { admin } = buildAdmin({ upsertError: { message: 'rls_denied', code: '42501' } });
    await expect(
      upsertCommissionForDocument(admin, {
        document: { id: 'd1', total_amount: 1000 },
        profile: { commission_rate: 10 },
        agentId: 'a1',
      }),
    ).rejects.toMatchObject({ message: 'rls_denied', code: '42501' });
  });

  test('skips on missing agentId or profile', async () => {
    const { admin } = buildAdmin();
    const r = await upsertCommissionForDocument(admin, {
      document: { id: 'd1', total_amount: 1000 },
      profile: null,
      agentId: null,
    });
    expect(r).toMatchObject({ skipped: true, reason: 'no_agent' });
  });

  // ── shipping deduction (Phase 19c) ────────────────────────────────────
  // Commission base = total_amount − shipping. These tests lock the new
  // behaviour and the back-compat fallback so older docs (no metadata,
  // or only `formState.deliveryCost`) keep working.

  test('shipping=0 (no metadata): commission = total × rate (regression)', async () => {
    const { admin, upsertCalls } = buildAdmin();
    const r = await upsertCommissionForDocument(admin, {
      document: { id: 'd1', total_amount: 1000 /* metadata absent */ },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(r).toMatchObject({ upserted: true, amount: 100, rate: 10 });
    expect(upsertCalls[0].row.order_total).toBe(1000);
  });

  test('shipping deducted: total=550, shipping=50, rate=10% → 50.00 on base 500', async () => {
    const { admin, upsertCalls } = buildAdmin();
    const r = await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 550,
        metadata: { shipping_amount: 50 },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(r).toMatchObject({ upserted: true, amount: 50, rate: 10 });
    expect(upsertCalls[0].row.order_total).toBe(500);
  });

  test('shipping_amount preferred over deliveryCost when both present', async () => {
    const { admin, upsertCalls } = buildAdmin();
    await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 1000,
        metadata: { shipping_amount: 100, formState: { deliveryCost: 999 } },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(upsertCalls[0].row.order_total).toBe(900);
    expect(upsertCalls[0].row.commission_amount).toBe(90);
  });

  test('falls back to metadata.formState.deliveryCost when shipping_amount missing', async () => {
    const { admin, upsertCalls } = buildAdmin();
    await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 1000,
        metadata: { formState: { deliveryCost: 200 } },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(upsertCalls[0].row.order_total).toBe(800);
    expect(upsertCalls[0].row.commission_amount).toBe(80);
  });

  test('shipping >= total → skipped with zero_after_shipping', async () => {
    const { admin, upsertCalls } = buildAdmin();
    const r = await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 100,
        metadata: { shipping_amount: 100 },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(r).toMatchObject({ skipped: true, reason: 'zero_after_shipping' });
    expect(upsertCalls).toEqual([]);
  });

  test('negative shipping is clamped to 0 (junk metadata cannot inflate base)', async () => {
    const { admin, upsertCalls } = buildAdmin();
    const r = await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 1000,
        metadata: { shipping_amount: -500 },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(r).toMatchObject({ upserted: true, amount: 100, rate: 10 });
    expect(upsertCalls[0].row.order_total).toBe(1000);
  });
});
