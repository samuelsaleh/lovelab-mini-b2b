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
 *     ✓ persists an editable ledger row when rate is 0
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

  test('tier 1 — invited agent who can create an order is attributable', async () => {
    const admin = makeAdmin({
      profiles: { maybeSingle: { data: { id: 'a1', is_agent: true, agent_status: 'invited' }, error: null } },
    });
    const r = await resolveCommissionAgent(admin, { id: 'd1', created_by: 'a1', event_id: null });
    expect(r).toMatchObject({ agentId: 'a1', via: 'creator' });
  });

  test('returns null when no creator and no event', async () => {
    const admin = makeAdmin({});
    const r = await resolveCommissionAgent(admin, { id: 'd1', created_by: null, event_id: null });
    expect(r).toBeNull();
  });

  test('tier 2 — event folder name matches a specific sub-agent', async () => {
    let profilesMaybe = 0;
    const admin = {
      from: jest.fn((table) => {
        const chain = {};
        const ret = () => chain;
        chain.select = jest.fn(ret);
        chain.eq = jest.fn(ret);
        chain.in = jest.fn(ret);
        chain.is = jest.fn(ret);
        chain.ilike = jest.fn(ret);
        chain.limit = jest.fn(ret);
        chain.maybeSingle = jest.fn(() => {
          if (table === 'profiles') {
            profilesMaybe++;
            return Promise.resolve({ data: { is_agent: false }, error: null });
          }
          if (table === 'events') {
            return Promise.resolve({
              data: {
                created_by: 'admin',
                organization_id: 'org-sarah',
                type: 'agent',
                name: 'Wassila Mekidiche',
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        });
        // Name-match query is awaited as a thenable (not maybeSingle).
        chain.then = (resolve, reject) => {
          if (table === 'profiles' && profilesMaybe >= 1) {
            return Promise.resolve({
              data: [{
                id: 'wassila',
                full_name: 'Wassila Mekidiche',
                is_agent: true,
                agent_status: 'active',
                organization_id: 'org-sarah',
              }],
              error: null,
            }).then(resolve, reject);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        };
        return chain;
      }),
    };
    const r = await resolveCommissionAgent(admin, { id: 'd1', created_by: 'admin-id', event_id: 'evt-wassila' });
    expect(r).toMatchObject({ agentId: 'wassila', via: 'event_name' });
  });

  test('tier 3 — event has org with active agent when name does not match', async () => {
    // Sequence: profiles(creator) → non-agent, events → org folder without exact
    // name match, name query → [], profiles(org) → first org agent
    let profilesMaybe = 0;
    const admin = {
      from: jest.fn((table) => {
        const chain = {};
        const ret = () => chain;
        chain.select = jest.fn(ret);
        chain.eq = jest.fn(ret);
        chain.in = jest.fn(ret);
        chain.is = jest.fn(ret);
        chain.ilike = jest.fn(ret);
        chain.limit = jest.fn(ret);
        chain.maybeSingle = jest.fn(() => {
          if (table === 'profiles') {
            profilesMaybe++;
            if (profilesMaybe === 1) return Promise.resolve({ data: { is_agent: false }, error: null });
            return Promise.resolve({ data: { id: 'orgAgent', is_agent: true, agent_status: 'active', organization_id: 'org1' }, error: null });
          }
          if (table === 'events') {
            return Promise.resolve({
              data: { created_by: 'someone-else', organization_id: 'org1', type: 'agent', name: 'Legacy Folder' },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        });
        chain.then = (resolve, reject) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject);
        return chain;
      }),
    };
    const r = await resolveCommissionAgent(admin, { id: 'd1', created_by: 'creator-id', event_id: 'evt1' });
    expect(r).toMatchObject({ agentId: 'orgAgent', via: 'event_organization' });
  });

  test('tier 4 — event creator is an active agent', async () => {
    let profilesCall = 0;
    const admin = {
      from: jest.fn((table) => {
        const chain = {};
        const ret = () => chain;
        chain.select = jest.fn(ret);
        chain.eq = jest.fn(ret);
        chain.in = jest.fn(ret);
        chain.is = jest.fn(ret);
        chain.ilike = jest.fn(ret);
        chain.limit = jest.fn(ret);
        chain.maybeSingle = jest.fn(() => {
          if (table === 'profiles') {
            profilesCall++;
            if (profilesCall === 1) return Promise.resolve({ data: { is_agent: false }, error: null });
            return Promise.resolve({ data: { id: 'evtCreator', is_agent: true, agent_status: 'active' }, error: null });
          }
          if (table === 'events') {
            return Promise.resolve({ data: { created_by: 'evtCreator', organization_id: null, type: 'event', name: null }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        });
        chain.then = (resolve, reject) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject);
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
        chain.in = jest.fn(ret);
        chain.is = jest.fn(ret);
        chain.ilike = jest.fn(ret);
        chain.limit = jest.fn(ret);
        chain.maybeSingle = jest.fn(() => {
          if (table === 'profiles') {
            profilesCall++;
            return Promise.resolve({ data: { is_agent: false }, error: null });
          }
          if (table === 'events') {
            return Promise.resolve({ data: { created_by: 'caller', organization_id: null, type: 'other', name: null }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        });
        chain.then = (resolve, reject) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject);
        return chain;
      }),
    };
    const r = await resolveCommissionAgent(admin, { id: 'd1', created_by: 'caller', event_id: 'evt1' });
    expect(r).toBeNull();
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
    expect(upsertCalls[0].opts).toEqual({ onConflict: 'agent_id,document_id,type' });
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

  test('persists an editable ledger row when computed amount is 0 (e.g. rate 0)', async () => {
    const { admin, upsertCalls } = buildAdmin();
    const r = await upsertCommissionForDocument(admin, {
      document: { id: 'd1', total_amount: 1000 },
      profile: { commission_rate: 0, organization_id: null },
      agentId: 'a1',
    });
    expect(r).toMatchObject({ upserted: true, amount: 0, rate: 0 });
    expect(upsertCalls[0].row).toMatchObject({
      agent_id: 'a1',
      document_id: 'd1',
      commission_amount: 0,
      commission_rate: 0,
    });
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

  // ─── VAT exclusion ────────────────────────────────────────────────────
  // The base for the agent's commission is NET revenue, not the post-VAT
  // grand total saved into `documents.total_amount`. These tests pin down
  // the back-out so an agent can never earn commission on the customer's
  // tax money again.

  test('VAT 21% is backed out before computing commission base', async () => {
    const { admin, upsertCalls } = buildAdmin();
    // Subtotal 1000 + shipping 50 → baseForTax 1050 → +21% VAT (220.50)
    // → grand total 1270.50. Commission base must be 1000 (pre-VAT, ex-ship).
    await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 1270.5,
        metadata: {
          shipping_amount: 50,
          formState: { taxPercent: 21 },
        },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(upsertCalls[0].row.order_total).toBe(1000);
    expect(upsertCalls[0].row.commission_amount).toBe(100);
  });

  test('top-level metadata.tax_percent wins over formState.taxPercent', async () => {
    const { admin, upsertCalls } = buildAdmin();
    await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 1210, // 1000 + 21% VAT, no shipping
        metadata: {
          tax_percent: 21,
          formState: { taxPercent: 999 }, // junk fallback should be ignored
        },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(upsertCalls[0].row.order_total).toBe(1000);
  });

  test('no VAT field → behaviour matches pre-fix (back-compat for old docs)', async () => {
    const { admin, upsertCalls } = buildAdmin();
    await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 1000,
        metadata: { shipping_amount: 50 },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(upsertCalls[0].row.order_total).toBe(950);
  });

  test('taxPercent of 0 is treated as no VAT', async () => {
    const { admin, upsertCalls } = buildAdmin();
    await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 1000,
        metadata: { formState: { taxPercent: 0 } },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(upsertCalls[0].row.order_total).toBe(1000);
  });

  test('out-of-range taxPercent is ignored (junk cannot deflate commissions)', async () => {
    const { admin, upsertCalls } = buildAdmin();
    // taxPercent = 150 is nonsense; treat as 0 so commission base = total.
    await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 1000,
        metadata: { tax_percent: 150 },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(upsertCalls[0].row.order_total).toBe(1000);
  });

  test('negative taxPercent is ignored', async () => {
    const { admin, upsertCalls } = buildAdmin();
    await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 1000,
        metadata: { tax_percent: -10 },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(upsertCalls[0].row.order_total).toBe(1000);
  });

  test('VAT and shipping combined: 21% VAT + 50 shipping on 1000 net', async () => {
    const { admin, upsertCalls } = buildAdmin();
    // 1000 net + 50 shipping = 1050 ex-VAT
    // 1050 * 1.21 = 1270.50 grand total
    // Commission base must be 1000 (1270.50 / 1.21 - 50).
    await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 1270.5,
        metadata: {
          shipping_amount: 50,
          tax_percent: 21,
        },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(upsertCalls[0].row.order_total).toBe(1000);
    expect(upsertCalls[0].row.commission_amount).toBe(100);
  });

  test('rounding: irrational pre-VAT amount is persisted at cent precision', async () => {
    const { admin, upsertCalls } = buildAdmin();
    // total 121, 21% VAT → preTax = 100.0000000000000142...
    // After rounding: 100.00 exact.
    await upsertCommissionForDocument(admin, {
      document: {
        id: 'd1',
        total_amount: 121,
        metadata: { tax_percent: 21 },
      },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(upsertCalls[0].row.order_total).toBe(100);
  });

  // ─── Missing unique-constraint fallback (Phase 19d not yet applied) ────
  // Some Supabase environments still ship without the
  // `agent_commissions_agent_document_type_unique` index. Postgres returns
  // 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
  // specification") and we must NOT silently lose the commission — fall
  // back to a manual lookup + insert/update so the agent still gets paid.

  function buildAdminWithMissingConstraint({ existingRow = null, opSpy = jest.fn() } = {}) {
    const calls = { upsert: [], insert: [], update: [], lookup: [] };
    let lookupCount = 0;
    const fromImpl = (table) => {
      if (table === 'agent_commissions') {
        return {
          upsert: jest.fn((row, opts) => {
            calls.upsert.push({ row, opts });
            return Promise.resolve({
              data: null,
              error: { code: '42P10', message: 'no unique or exclusion constraint matching the ON CONFLICT specification' },
            });
          }),
          // SELECT chain for the manual lookup fallback
          select: jest.fn(() => {
            const chain = {};
            const ret = () => chain;
            chain.eq = jest.fn(ret);
            chain.maybeSingle = jest.fn(() => {
              lookupCount++;
              calls.lookup.push(true);
              return Promise.resolve({ data: existingRow, error: null });
            });
            return chain;
          }),
          insert: jest.fn((row) => {
            calls.insert.push(row);
            opSpy('insert');
            return Promise.resolve({ data: null, error: null });
          }),
          update: jest.fn((row) => {
            calls.update.push(row);
            opSpy('update');
            const chain = {};
            chain.eq = jest.fn(() => Promise.resolve({ data: null, error: null }));
            return chain;
          }),
        };
      }
      throw new Error('unexpected table: ' + table);
    };
    return { admin: { from: jest.fn(fromImpl) }, calls };
  }

  test('falls back to INSERT when constraint missing and no existing row', async () => {
    const { admin, calls } = buildAdminWithMissingConstraint({ existingRow: null });
    const r = await upsertCommissionForDocument(admin, {
      document: { id: 'd1', total_amount: 970 },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(r).toMatchObject({ upserted: true, amount: 97, rate: 10 });
    expect(calls.upsert).toHaveLength(1);
    expect(calls.lookup).toHaveLength(1);
    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0]).toMatchObject({
      agent_id: 'a1', document_id: 'd1', type: 'order',
      order_total: 970, commission_amount: 97, status: 'pending',
    });
    expect(calls.update).toHaveLength(0);
  });

  test('falls back to UPDATE when constraint missing and row exists', async () => {
    const { admin, calls } = buildAdminWithMissingConstraint({
      existingRow: { id: 'existing-id', status: 'pending' },
    });
    const r = await upsertCommissionForDocument(admin, {
      document: { id: 'd1', total_amount: 970 },
      profile: { commission_rate: 10 },
      agentId: 'a1',
    });
    expect(r).toMatchObject({ upserted: true, amount: 97, rate: 10 });
    expect(calls.update).toHaveLength(1);
    expect(calls.update[0]).toMatchObject({
      order_total: 970, commission_rate: 10, commission_amount: 97,
    });
    // status NOT touched on update (preserves admin's paid/cancelled choice)
    expect(calls.update[0].status).toBeUndefined();
    expect(calls.insert).toHaveLength(0);
  });

  test('non-42P10 errors still throw with code preserved', async () => {
    // Build a buildAdmin variant that returns a non-constraint error
    const fromImpl = (table) => {
      if (table === 'agent_commissions') {
        return {
          upsert: jest.fn(() =>
            Promise.resolve({ data: null, error: { code: '42501', message: 'rls_denied' } }),
          ),
        };
      }
      throw new Error('unexpected table: ' + table);
    };
    const admin = { from: jest.fn(fromImpl) };
    await expect(
      upsertCommissionForDocument(admin, {
        document: { id: 'd1', total_amount: 1000 },
        profile: { commission_rate: 10 },
        agentId: 'a1',
      }),
    ).rejects.toMatchObject({ message: 'rls_denied', code: '42501' });
  });
});
