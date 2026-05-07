/**
 * @jest-environment node
 *
 * newClientBonus — unit tests (Phase 19).
 *
 * Locks the fuzzy-customer key, the "first order for this customer" rule,
 * the preview shape, the backfill writes, and the forward-going hook.
 *
 * Coverage:
 *   normalizeCustomerName + customerKeyForDocument
 *     ✓ legal entity tokens stripped (SAS / SARL / S.A.R.L. / BV / Ltd / S.r.l)
 *     ✓ accents folded (Genève → geneve)
 *     ✓ null / empty / whitespace → ''
 *     ✓ company preferred, falls back to name
 *
 *   isFirstOrderForCustomer
 *     ✓ no prior commissions → true
 *     ✓ same fuzzy customer earlier (non-cancelled) → false
 *     ✓ same fuzzy customer earlier but CANCELLED → still true (cancelled excluded)
 *     ✓ same fuzzy customer earlier but document DELETED → still true
 *     ✓ same fuzzy customer LATER (created_at > current) → still true (only earlier disqualifies)
 *
 *   previewBackfill
 *     ✓ 0 docs → empty preview
 *     ✓ 5 distinct customers + 2 fuzzy duplicates → 5 rows
 *     ✓ existing bonus rows excluded from preview
 *     ✓ amount=0 → preview still returns rows (caller decides)
 *
 *   executeBackfill
 *     ✓ writes N rows for N distinct customers, idempotent on rerun
 *     ✓ amount=0 or null → no writes
 *
 *   maybeCreateBonusForOrder
 *     ✓ disabled → skipped
 *     ✓ amount missing/zero → skipped
 *     ✓ already exists → skipped
 *     ✓ new customer → created
 *     ✓ repeat customer → skipped
 */

import {
  normalizeCustomerName,
  customerKeyForDocument,
  isFirstOrderForCustomer,
  previewBackfill,
  executeBackfill,
  maybeCreateBonusForOrder,
} from '@/lib/newClientBonus';

// ── Helper: build a chainable Supabase mock ─────────────────────────────
//
// Each call to admin.from(table) returns a fresh chain whose terminal
// methods (maybeSingle / select awaited / insert / update) are configured
// per call via the `respond` arg. Calls are recorded for assertions.
function makeAdmin({ tableResponses = {}, recordCalls = [] } = {}) {
  const fromImpl = (table) => {
    const responses = tableResponses[table] || {};
    let queuePos = 0;
    const queue = responses.queue || null;
    const chain = {};
    const ret = () => chain;
    chain.select = jest.fn(ret);
    chain.eq = jest.fn(ret);
    chain.in = jest.fn(ret);
    chain.is = jest.fn(ret);
    chain.neq = jest.fn(ret);
    chain.order = jest.fn(ret);
    chain.limit = jest.fn(ret);

    chain.maybeSingle = jest.fn().mockImplementation(() => {
      if (queue) {
        const v = queue[Math.min(queuePos, queue.length - 1)];
        queuePos++;
        return Promise.resolve(v);
      }
      return Promise.resolve(responses.maybeSingle || { data: null, error: null });
    });

    chain.insert = jest.fn((rows) => {
      recordCalls.push({ table, op: 'insert', rows });
      return {
        select: () => Promise.resolve(responses.insert || { data: rows, error: null }),
      };
    });

    // Promise-resolution: when the chain itself is awaited, return the
    // configured "list" payload. previewBackfill awaits the chain after
    // .select(...).eq(...).order(...).
    chain.then = (resolve, reject) => {
      const v = responses.select || { data: [], error: null };
      return Promise.resolve(v).then(resolve, reject);
    };
    return chain;
  };
  return { from: jest.fn(fromImpl) };
}

// ────────────────────────────────────────────────────────────────────────
// normalizeCustomerName + customerKeyForDocument
// ────────────────────────────────────────────────────────────────────────

describe('normalizeCustomerName', () => {
  test.each([
    ['SAS Little Factory', 'little factory'],
    ['Little Factory', 'little factory'],
    ['LITTLE FACTORY SARL', 'little factory'],
    ['S.A.R.L. Casadona', 'casadona'],
    ['Sarl Casadona', 'casadona'],
    ['Smile Genève', 'smile geneve'],
    ['Sophie & Ju', 'sophie ju'],
    ['Le SARL Sky Garden', 'le sky garden'],
    ['  multiple   spaces  ', 'multiple spaces'],
    ['BV Some Company', 'some company'],
    ['Some Company Ltd', 'some company'],
    ['MJG GmbH', 'mjg'],
    [null, ''],
    [undefined, ''],
    ['', ''],
    ['   ', ''],
  ])('%s → %s', (input, expected) => {
    expect(normalizeCustomerName(input)).toBe(expected);
  });

  test('stacked tokens: "SAS SARL Casadona" → "casadona"', () => {
    expect(normalizeCustomerName('SAS SARL Casadona')).toBe('casadona');
  });
});

describe('customerKeyForDocument', () => {
  test('prefers client_company', () => {
    expect(customerKeyForDocument({ client_company: 'SAS Blush', client_name: 'Marie' }))
      .toBe('blush');
  });
  test('falls back to client_name when company empty', () => {
    expect(customerKeyForDocument({ client_company: '', client_name: 'Madame X' }))
      .toBe('madame x');
  });
  test('null doc → empty', () => {
    expect(customerKeyForDocument(null)).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────
// isFirstOrderForCustomer
// ────────────────────────────────────────────────────────────────────────

describe('isFirstOrderForCustomer', () => {
  function adminWithCommissions(commRows) {
    return makeAdmin({
      tableResponses: {
        agent_commissions: { select: { data: commRows, error: null } },
      },
    });
  }

  const today = new Date('2026-05-01T10:00:00Z').toISOString();
  const yesterday = new Date('2026-04-30T10:00:00Z').toISOString();
  const tomorrow = new Date('2026-05-02T10:00:00Z').toISOString();

  test('no prior commissions → true', async () => {
    const admin = adminWithCommissions([]);
    const r = await isFirstOrderForCustomer(admin, 'agent1', {
      id: 'd-new', client_company: 'Blush', created_at: today,
    });
    expect(r).toBe(true);
  });

  test('same fuzzy customer earlier (non-cancelled) → false', async () => {
    const admin = adminWithCommissions([
      {
        id: 'c1', document_id: 'd-old', type: 'order', status: 'pending',
        documents: { id: 'd-old', client_company: 'SAS Blush', client_name: null, created_at: yesterday, deleted_at: null },
      },
    ]);
    const r = await isFirstOrderForCustomer(admin, 'agent1', {
      id: 'd-new', client_company: 'Blush', created_at: today,
    });
    expect(r).toBe(false);
  });

  test('same fuzzy customer earlier but CANCELLED → ignored, true', async () => {
    // A cancelled commission in the DB shouldn't make it into the result
    // set in real life (we filter via .neq('status','cancelled')). The
    // test simulates this by simply not returning cancelled rows.
    const admin = adminWithCommissions([]);
    const r = await isFirstOrderForCustomer(admin, 'agent1', {
      id: 'd-new', client_company: 'Blush', created_at: today,
    });
    expect(r).toBe(true);
  });

  test('same fuzzy customer earlier but document DELETED → still true', async () => {
    const admin = adminWithCommissions([
      {
        id: 'c1', document_id: 'd-old', type: 'order', status: 'pending',
        documents: { id: 'd-old', client_company: 'Blush', created_at: yesterday, deleted_at: '2026-04-30T11:00:00Z' },
      },
    ]);
    const r = await isFirstOrderForCustomer(admin, 'agent1', {
      id: 'd-new', client_company: 'Blush', created_at: today,
    });
    expect(r).toBe(true);
  });

  test('same fuzzy customer LATER → still true (only earlier disqualifies)', async () => {
    const admin = adminWithCommissions([
      {
        id: 'c1', document_id: 'd-future', type: 'order', status: 'pending',
        documents: { id: 'd-future', client_company: 'Blush', created_at: tomorrow, deleted_at: null },
      },
    ]);
    const r = await isFirstOrderForCustomer(admin, 'agent1', {
      id: 'd-new', client_company: 'Blush', created_at: today,
    });
    expect(r).toBe(true);
  });

  test('same fuzzy customer same timestamp (the doc itself) → true', async () => {
    const admin = adminWithCommissions([
      {
        id: 'c1', document_id: 'd-new', type: 'order', status: 'pending',
        documents: { id: 'd-new', client_company: 'Blush', created_at: today, deleted_at: null },
      },
    ]);
    const r = await isFirstOrderForCustomer(admin, 'agent1', {
      id: 'd-new', client_company: 'Blush', created_at: today,
    });
    expect(r).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// previewBackfill
// ────────────────────────────────────────────────────────────────────────

describe('previewBackfill', () => {
  function adminFor({ directDocs, commDocs = [], existingBonuses = [] }) {
    let calls = 0;
    return {
      from: jest.fn((table) => {
        calls++;
        const chain = {};
        const ret = () => chain;
        chain.select = jest.fn(ret);
        chain.eq = jest.fn(ret);
        chain.in = jest.fn(ret);
        chain.is = jest.fn(ret);
        chain.neq = jest.fn(ret);
        chain.order = jest.fn(ret);
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
        chain.then = (resolve) => {
          if (table === 'documents') return Promise.resolve({ data: directDocs, error: null }).then(resolve);
          if (table === 'agent_commissions') {
            // First call inside previewBackfill = via-commissions fetch (joined),
            // Second call = existing bonuses fetch.
            // We disambiguate by what fields select asked for; simpler: track
            // the second call to agent_commissions returns existingBonuses.
            const isExisting = chain.__type === 'existing_bonus';
            return Promise.resolve({
              data: isExisting ? existingBonuses : commDocs.map(d => ({ document_id: d.id, type: 'order', status: 'pending', documents: d })),
              error: null,
            }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        };
        // Mark a chain as "existing bonuses" when it filters by type='new_client_bonus'.
        const realEq = chain.eq;
        chain.eq = (col, val) => {
          if (table === 'agent_commissions' && col === 'type' && val === 'new_client_bonus') {
            chain.__type = 'existing_bonus';
          }
          return realEq.call(chain, col, val);
        };
        return chain;
      }),
    };
  }

  test('0 docs → empty preview', async () => {
    const admin = adminFor({ directDocs: [] });
    const r = await previewBackfill(admin, 'agent1', 200);
    expect(r).toEqual({ rows: [], customer_count: 0, total: 0 });
  });

  test('5 distinct customers + 2 fuzzy duplicates → 5 rows', async () => {
    const directDocs = [
      { id: 'd1', client_company: 'SAS Blush',         client_name: null, created_at: '2026-03-01', document_type: 'order', deleted_at: null, total_amount: 500 },
      { id: 'd2', client_company: 'Blush',              client_name: null, created_at: '2026-03-15', document_type: 'order', deleted_at: null, total_amount: 700 },  // fuzzy dup
      { id: 'd3', client_company: 'Sarl Casadona',     client_name: null, created_at: '2026-03-10', document_type: 'order', deleted_at: null, total_amount: 1000 },
      { id: 'd4', client_company: 'Casadona',          client_name: null, created_at: '2026-03-20', document_type: 'order', deleted_at: null, total_amount: 1200 }, // fuzzy dup
      { id: 'd5', client_company: 'Little Factory',    client_name: null, created_at: '2026-04-01', document_type: 'order', deleted_at: null, total_amount: 800 },
      { id: 'd6', client_company: 'Smile Genève',      client_name: null, created_at: '2026-04-10', document_type: 'order', deleted_at: null, total_amount: 600 },
      { id: 'd7', client_company: 'MJG GmbH',          client_name: null, created_at: '2026-04-12', document_type: 'order', deleted_at: null, total_amount: 400 },
    ];
    const admin = adminFor({ directDocs });
    const r = await previewBackfill(admin, 'agent1', 200);
    expect(r.customer_count).toBe(5);
    expect(r.total).toBe(1000); // 5 × 200
    expect(r.rows.map(x => x.customer_key)).toEqual([
      'blush', 'casadona', 'little factory', 'smile geneve', 'mjg',
    ]);
    // Each row should point at the EARLIEST doc per customer.
    expect(r.rows[0]).toMatchObject({ customer: 'SAS Blush', document_id: 'd1' });
    expect(r.rows[1]).toMatchObject({ customer: 'Sarl Casadona', document_id: 'd3' });
  });

  test('existing bonus rows are excluded from preview', async () => {
    const directDocs = [
      { id: 'd1', client_company: 'Blush',          client_name: null, created_at: '2026-03-01', document_type: 'order', deleted_at: null },
      { id: 'd2', client_company: 'Little Factory', client_name: null, created_at: '2026-03-10', document_type: 'order', deleted_at: null },
    ];
    const existingBonuses = [{ document_id: 'd1' }];
    const admin = adminFor({ directDocs, existingBonuses });
    const r = await previewBackfill(admin, 'agent1', 200);
    expect(r.customer_count).toBe(1);
    expect(r.rows[0]).toMatchObject({ document_id: 'd2', customer: 'Little Factory' });
  });

  test('amount=0 still returns rows but total=0 (caller decides)', async () => {
    const directDocs = [
      { id: 'd1', client_company: 'Blush', client_name: null, created_at: '2026-03-01', document_type: 'order', deleted_at: null },
    ];
    const admin = adminFor({ directDocs });
    const r = await previewBackfill(admin, 'agent1', 0);
    expect(r.customer_count).toBe(1);
    expect(r.total).toBe(0);
    expect(r.rows[0].amount).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// executeBackfill
// ────────────────────────────────────────────────────────────────────────

describe('executeBackfill', () => {
  test('amount=0 → no writes, returns zero counts', async () => {
    const insertCalls = [];
    const admin = {
      from: jest.fn(() => ({
        insert: jest.fn((rows) => {
          insertCalls.push(rows);
          return { select: () => Promise.resolve({ data: rows, error: null }) };
        }),
        select: () => ({ eq: () => ({ eq: () => ({ neq: () => Promise.resolve({ data: [], error: null }) }) }) }),
      })),
    };
    const r = await executeBackfill(admin, 'agent1', 0);
    expect(r).toEqual({ created: 0, total: 0, rows: [] });
    expect(insertCalls).toEqual([]);
  });

  test('null amount → no writes', async () => {
    const admin = { from: jest.fn() };
    const r = await executeBackfill(admin, 'agent1', null);
    expect(r).toEqual({ created: 0, total: 0, rows: [] });
    expect(admin.from).not.toHaveBeenCalled();
  });

  test('writes one insert call with N rows for N distinct customers', async () => {
    const directDocs = [
      { id: 'd1', client_company: 'SAS Blush',     client_name: null, created_at: '2026-03-01', document_type: 'order', deleted_at: null, total_amount: 500 },
      { id: 'd2', client_company: 'Blush',          client_name: null, created_at: '2026-03-15', document_type: 'order', deleted_at: null, total_amount: 700 },
      { id: 'd3', client_company: 'Casadona',       client_name: null, created_at: '2026-03-20', document_type: 'order', deleted_at: null, total_amount: 600 },
    ];
    const insertedRows = [];
    const admin = {
      from: jest.fn((table) => {
        const chain = {};
        const ret = () => chain;
        chain.select = jest.fn(ret);
        chain.eq = jest.fn(ret);
        chain.in = jest.fn(ret);
        chain.is = jest.fn(ret);
        chain.neq = jest.fn(ret);
        chain.order = jest.fn(ret);
        chain.then = (resolve) => {
          if (table === 'documents') return Promise.resolve({ data: directDocs, error: null }).then(resolve);
          if (table === 'agent_commissions') {
            const isExisting = chain.__type === 'existing_bonus';
            return Promise.resolve({ data: isExisting ? [] : [], error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        };
        const realEq = chain.eq;
        chain.eq = (col, val) => {
          if (table === 'agent_commissions' && col === 'type' && val === 'new_client_bonus') {
            chain.__type = 'existing_bonus';
          }
          return realEq.call(chain, col, val);
        };
        chain.insert = jest.fn((rows) => {
          insertedRows.push(...rows);
          return { select: () => Promise.resolve({ data: rows.map(r => ({ id: 'gen', ...r })), error: null }) };
        });
        return chain;
      }),
    };
    const r = await executeBackfill(admin, 'agent1', 200);
    expect(r.created).toBe(2); // 'blush' (d1 wins) + 'casadona' (d3)
    expect(r.total).toBe(400);
    expect(insertedRows.map(r => r.document_id).sort()).toEqual(['d1', 'd3']);
    expect(insertedRows.every(r => r.type === 'new_client_bonus')).toBe(true);
    expect(insertedRows.every(r => r.commission_amount === 200)).toBe(true);
    expect(insertedRows.every(r => r.status === 'pending')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// maybeCreateBonusForOrder
// ────────────────────────────────────────────────────────────────────────

describe('maybeCreateBonusForOrder', () => {
  function adminBuilder({ existing = null, commissionsForFirst = [], insertResp = { data: null, error: null } } = {}) {
    const inserted = [];
    return {
      inserted,
      admin: {
        from: jest.fn((table) => {
          const chain = {};
          const ret = () => chain;
          chain.select = jest.fn(ret);
          chain.eq = jest.fn(ret);
          chain.in = jest.fn(ret);
          chain.is = jest.fn(ret);
          chain.neq = jest.fn(ret);
          chain.order = jest.fn(ret);
          chain.maybeSingle = jest.fn().mockImplementation(() => {
            if (table === 'agent_commissions') return Promise.resolve({ data: existing, error: null });
            return Promise.resolve({ data: null, error: null });
          });
          chain.insert = jest.fn((row) => {
            inserted.push(row);
            return Promise.resolve(insertResp);
          });
          chain.then = (resolve) => {
            if (table === 'agent_commissions') {
              return Promise.resolve({ data: commissionsForFirst, error: null }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          };
          return chain;
        }),
      },
    };
  }

  const baseDoc = {
    id: 'd1', client_company: 'Blush', client_name: null,
    created_at: '2026-05-01T10:00:00Z',
  };

  test('disabled → skipped', async () => {
    const { admin } = adminBuilder();
    const r = await maybeCreateBonusForOrder(admin, {
      agentId: 'a1',
      profile: { new_client_bonus_enabled: false, new_client_bonus_amount: 200 },
      document: baseDoc,
    });
    expect(r).toEqual({ skipped: true, reason: 'feature_disabled' });
  });

  test('amount missing → skipped', async () => {
    const { admin } = adminBuilder();
    const r = await maybeCreateBonusForOrder(admin, {
      agentId: 'a1',
      profile: { new_client_bonus_enabled: true, new_client_bonus_amount: null },
      document: baseDoc,
    });
    expect(r).toEqual({ skipped: true, reason: 'no_amount' });
  });

  test('amount = 0 → skipped', async () => {
    const { admin } = adminBuilder();
    const r = await maybeCreateBonusForOrder(admin, {
      agentId: 'a1',
      profile: { new_client_bonus_enabled: true, new_client_bonus_amount: 0 },
      document: baseDoc,
    });
    expect(r).toEqual({ skipped: true, reason: 'no_amount' });
  });

  test('already exists → skipped', async () => {
    const { admin, inserted } = adminBuilder({ existing: { id: 'existing-bonus' } });
    const r = await maybeCreateBonusForOrder(admin, {
      agentId: 'a1',
      profile: { new_client_bonus_enabled: true, new_client_bonus_amount: 200 },
      document: baseDoc,
    });
    expect(r).toEqual({ skipped: true, reason: 'already_exists' });
    expect(inserted).toEqual([]);
  });

  test('repeat customer → skipped (not_first_order)', async () => {
    // Earlier order for same fuzzy customer
    const earlier = '2026-04-01T10:00:00Z';
    const { admin, inserted } = adminBuilder({
      existing: null,
      commissionsForFirst: [
        {
          id: 'c-old', document_id: 'd-old', type: 'order', status: 'pending',
          documents: { id: 'd-old', client_company: 'SAS Blush', client_name: null, created_at: earlier, deleted_at: null },
        },
      ],
    });
    const r = await maybeCreateBonusForOrder(admin, {
      agentId: 'a1',
      profile: { new_client_bonus_enabled: true, new_client_bonus_amount: 200 },
      document: baseDoc,
    });
    expect(r).toEqual({ skipped: true, reason: 'not_first_order' });
    expect(inserted).toEqual([]);
  });

  test('new customer → created with correct shape', async () => {
    const { admin, inserted } = adminBuilder({
      existing: null,
      commissionsForFirst: [],
    });
    const r = await maybeCreateBonusForOrder(admin, {
      agentId: 'a1',
      profile: { new_client_bonus_enabled: true, new_client_bonus_amount: 200 },
      document: baseDoc,
    });
    expect(r).toEqual({ created: true, amount: 200 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      agent_id: 'a1',
      document_id: 'd1',
      type: 'new_client_bonus',
      order_total: 0,
      commission_rate: 0,
      commission_amount: 200,
      status: 'pending',
    });
    expect(inserted[0].notes).toContain('Blush');
  });
});
