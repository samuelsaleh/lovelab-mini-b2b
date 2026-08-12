/**
 * Bonus modes: who is allowed to create a new-client bonus, and when.
 *
 * The whole point of the 'manual' mode is that NOTHING happens by
 * itself. If the automatic hook ever fires for a manual agent, Sam
 * silently owes €200 he never agreed to — so that gate gets the most
 * attention here.
 */

import {
  BONUS_MODES,
  resolveBonusMode,
  maybeCreateBonusForOrder,
  createManualBonusForOrder,
} from '../newClientBonus';

// Minimal Supabase double: enough chaining for the lookups the bonus
// helpers do, with the two lookups they care about made configurable.
function adminBuilder({
  existingBonus = null,
  orderCommission = { id: 'oc-1' },
  commissionsForFirst = [],
  document = {
    id: 'd1',
    client_company: 'Blush',
    client_name: null,
    created_at: '2026-05-01T10:00:00Z',
    deleted_at: null,
  },
} = {}) {
  const inserted = [];
  const admin = {
    from: jest.fn((table) => {
      const chain = {};
      const ret = () => chain;
      chain.select = jest.fn((cols) => {
        chain._cols = cols;
        return chain;
      });
      chain.eq = jest.fn((col, val) => {
        chain[`_${col}`] = val;
        return chain;
      });
      chain.in = jest.fn(ret);
      chain.is = jest.fn(ret);
      chain.neq = jest.fn(ret);
      chain.order = jest.fn(ret);
      chain.maybeSingle = jest.fn(() => {
        if (table === 'documents') return Promise.resolve({ data: document, error: null });
        // agent_commissions is queried twice: once for the order row the
        // bonus hangs off, once for an existing bonus on the document.
        if (chain._type === 'order') return Promise.resolve({ data: orderCommission, error: null });
        return Promise.resolve({ data: existingBonus, error: null });
      });
      chain.insert = jest.fn((row) => {
        inserted.push(row);
        return Promise.resolve({ data: null, error: null });
      });
      chain.then = (resolve) =>
        Promise.resolve({
          data: table === 'agent_commissions' ? commissionsForFirst : [],
          error: null,
        }).then(resolve);
      return chain;
    }),
  };
  return { admin, inserted };
}

const baseDoc = {
  id: 'd1',
  client_company: 'Blush',
  client_name: null,
  created_at: '2026-05-01T10:00:00Z',
};

describe('resolveBonusMode', () => {
  test('uses the mode column when it holds a known value', () => {
    for (const mode of BONUS_MODES) {
      expect(resolveBonusMode({ new_client_bonus_mode: mode })).toBe(mode);
    }
  });

  test('falls back to the legacy boolean when there is no mode', () => {
    expect(resolveBonusMode({ new_client_bonus_enabled: true })).toBe('auto');
    expect(resolveBonusMode({ new_client_bonus_enabled: false })).toBe('off');
  });

  test('an unknown or empty mode falls back to the boolean too', () => {
    expect(resolveBonusMode({ new_client_bonus_mode: 'sometimes', new_client_bonus_enabled: true })).toBe('auto');
    expect(resolveBonusMode({ new_client_bonus_mode: '', new_client_bonus_enabled: false })).toBe('off');
  });

  test('no profile at all is off', () => {
    expect(resolveBonusMode(null)).toBe('off');
    expect(resolveBonusMode(undefined)).toBe('off');
    expect(resolveBonusMode({})).toBe('off');
  });
});

describe('maybeCreateBonusForOrder — the automatic hook respects the mode', () => {
  const run = (profile) => {
    const { admin, inserted } = adminBuilder();
    return maybeCreateBonusForOrder(admin, { agentId: 'a1', profile, document: baseDoc })
      .then((result) => ({ result, inserted }));
  };

  test('manual mode creates NOTHING on order save', async () => {
    const { result, inserted } = await run({
      new_client_bonus_mode: 'manual',
      new_client_bonus_enabled: true,
      new_client_bonus_amount: 200,
    });
    expect(result).toEqual({ skipped: true, reason: 'manual_mode' });
    expect(inserted).toEqual([]);
  });

  test('off creates nothing', async () => {
    const { result, inserted } = await run({
      new_client_bonus_mode: 'off',
      new_client_bonus_enabled: false,
      new_client_bonus_amount: 200,
    });
    expect(result).toEqual({ skipped: true, reason: 'feature_disabled' });
    expect(inserted).toEqual([]);
  });

  test('auto still creates, exactly as before', async () => {
    const { result, inserted } = await run({
      new_client_bonus_mode: 'auto',
      new_client_bonus_enabled: true,
      new_client_bonus_amount: 200,
    });
    expect(result).toEqual({ created: true, amount: 200 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].notes).toContain('auto-detected');
  });

  test('a legacy profile with no mode column keeps its old behaviour', async () => {
    const { result } = await run({ new_client_bonus_enabled: true, new_client_bonus_amount: 200 });
    expect(result).toEqual({ created: true, amount: 200 });
  });

  test('mode beats a stale enabled flag', async () => {
    // enabled true + mode manual (what an agent looks like after the switch)
    const { result, inserted } = await run({
      new_client_bonus_mode: 'manual',
      new_client_bonus_enabled: true,
      new_client_bonus_amount: 200,
    });
    expect(result.created).toBeUndefined();
    expect(inserted).toEqual([]);
  });
});

describe('createManualBonusForOrder', () => {
  const profile = {
    new_client_bonus_mode: 'manual',
    new_client_bonus_enabled: true,
    new_client_bonus_amount: 200,
  };

  test('creates the bonus and records that a human decided', async () => {
    const { admin, inserted } = adminBuilder();
    const result = await createManualBonusForOrder(admin, {
      agentId: 'a1',
      profile,
      documentId: 'd1',
    });
    expect(result).toEqual({ created: true, amount: 200 });
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
    expect(inserted[0].notes).toContain('added by admin');
    expect(inserted[0].notes).toContain('Blush');
  });

  test('works in auto mode too — the admin can fill a gap by hand', async () => {
    const { admin, inserted } = adminBuilder();
    const result = await createManualBonusForOrder(admin, {
      agentId: 'a1',
      profile: { new_client_bonus_mode: 'auto', new_client_bonus_amount: 200 },
      documentId: 'd1',
    });
    expect(result).toEqual({ created: true, amount: 200 });
    expect(inserted).toHaveLength(1);
  });

  test('refuses when the bonus is switched off for this agent', async () => {
    const { admin, inserted } = adminBuilder();
    const result = await createManualBonusForOrder(admin, {
      agentId: 'a1',
      profile: { new_client_bonus_mode: 'off', new_client_bonus_amount: 200 },
      documentId: 'd1',
    });
    expect(result).toEqual({ skipped: true, reason: 'feature_disabled' });
    expect(inserted).toEqual([]);
  });

  test('refuses without a positive amount', async () => {
    const { admin, inserted } = adminBuilder();
    for (const amount of [null, 0, -50, 'abc']) {
      const result = await createManualBonusForOrder(admin, {
        agentId: 'a1',
        profile: { new_client_bonus_mode: 'manual', new_client_bonus_amount: amount },
        documentId: 'd1',
      });
      expect(result).toEqual({ skipped: true, reason: 'no_amount' });
    }
    expect(inserted).toEqual([]);
  });

  test('refuses when the agent has no order commission for that document', async () => {
    const { admin, inserted } = adminBuilder({ orderCommission: null });
    const result = await createManualBonusForOrder(admin, {
      agentId: 'a1',
      profile,
      documentId: 'd1',
    });
    expect(result).toEqual({ skipped: true, reason: 'no_order_commission' });
    expect(inserted).toEqual([]);
  });

  test('refuses a second bonus on the same order', async () => {
    const { admin, inserted } = adminBuilder({ existingBonus: { id: 'bonus-1' } });
    const result = await createManualBonusForOrder(admin, {
      agentId: 'a1',
      profile,
      documentId: 'd1',
    });
    expect(result).toEqual({ skipped: true, reason: 'already_exists' });
    expect(inserted).toEqual([]);
  });

  test('refuses when an earlier order for the same customer exists', async () => {
    // This is the safety net behind the button: the browser only sees a
    // page of rows, the database sees everything.
    const { admin, inserted } = adminBuilder({
      commissionsForFirst: [
        {
          id: 'c-old',
          document_id: 'd-old',
          type: 'order',
          status: 'pending',
          documents: {
            id: 'd-old',
            client_company: 'SAS Blush',
            client_name: null,
            created_at: '2026-04-01T10:00:00Z',
            deleted_at: null,
          },
        },
      ],
    });
    const result = await createManualBonusForOrder(admin, {
      agentId: 'a1',
      profile,
      documentId: 'd1',
    });
    expect(result).toEqual({ skipped: true, reason: 'not_first_order' });
    expect(inserted).toEqual([]);
  });

  test('refuses a deleted order', async () => {
    const { admin, inserted } = adminBuilder({
      document: { id: 'd1', client_company: 'Blush', created_at: '2026-05-01T10:00:00Z', deleted_at: '2026-06-01T10:00:00Z' },
    });
    const result = await createManualBonusForOrder(admin, {
      agentId: 'a1',
      profile,
      documentId: 'd1',
    });
    expect(result).toEqual({ skipped: true, reason: 'document_deleted' });
    expect(inserted).toEqual([]);
  });

  test('refuses a missing order', async () => {
    const { admin } = adminBuilder({ document: null });
    const result = await createManualBonusForOrder(admin, {
      agentId: 'a1',
      profile,
      documentId: 'd1',
    });
    expect(result).toEqual({ skipped: true, reason: 'document_not_found' });
  });

  test('refuses an order with no company or contact to match on', async () => {
    const { admin } = adminBuilder({
      document: { id: 'd1', client_company: '  ', client_name: null, created_at: '2026-05-01T10:00:00Z', deleted_at: null },
    });
    const result = await createManualBonusForOrder(admin, {
      agentId: 'a1',
      profile,
      documentId: 'd1',
    });
    expect(result).toEqual({ skipped: true, reason: 'no_customer_key' });
  });

  test('refuses incomplete input', async () => {
    const { admin } = adminBuilder();
    expect(await createManualBonusForOrder(admin, { agentId: '', profile, documentId: 'd1' }))
      .toEqual({ skipped: true, reason: 'missing_inputs' });
    expect(await createManualBonusForOrder(admin, { agentId: 'a1', profile, documentId: null }))
      .toEqual({ skipped: true, reason: 'missing_inputs' });
    expect(await createManualBonusForOrder(admin, { agentId: 'a1', profile: null, documentId: 'd1' }))
      .toEqual({ skipped: true, reason: 'missing_inputs' });
  });
});
