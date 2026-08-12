/**
 * Which order rows get the "+ €200 bonus" button.
 *
 * A false positive here means Sam is offered a bonus he already paid,
 * so the rules mirror the server: one bonus per fuzzy-matched customer,
 * on the earliest order, and never twice.
 */

import { eligibleManualBonusRowIds, customerKeyForRow } from '../newClientBonusEligibility';

const MANUAL_AGENT = {
  new_client_bonus_mode: 'manual',
  new_client_bonus_enabled: true,
  new_client_bonus_amount: 200,
};

const order = (id, company, createdAt, extra = {}) => ({
  id,
  type: 'order',
  status: 'pending',
  created_at: createdAt,
  document_id: `doc-for-${id}`,
  document: { id: `doc-for-${id}`, client_company: company, created_at: createdAt },
  ...extra,
});

const bonus = (id, company, documentId, extra = {}) => ({
  id,
  type: 'new_client_bonus',
  status: 'pending',
  created_at: '2026-05-01T10:00:00Z',
  document_id: documentId,
  document: { id: documentId, client_company: company },
  ...extra,
});

const eligible = (rows, opts = {}) =>
  [...eligibleManualBonusRowIds(rows, { agent: MANUAL_AGENT, ...opts })].sort();

describe('customerKeyForRow', () => {
  test('normalises the company name off the joined document', () => {
    expect(customerKeyForRow({ document: { client_company: 'SAS Little Factory' } })).toBe('little factory');
  });

  test('falls back to the contact name, then the quick-order label', () => {
    expect(customerKeyForRow({ document: { client_company: '', client_name: 'Jane Doe' } })).toBe('jane doe');
    expect(customerKeyForRow({ client_label: 'Walk-in Paris' })).toBe('walk in paris');
  });

  test('an empty row has no key', () => {
    expect(customerKeyForRow({})).toBe('');
    expect(customerKeyForRow(null)).toBe('');
  });
});

describe('eligibleManualBonusRowIds — the happy path', () => {
  test('a single first order is eligible', () => {
    expect(eligible([order('o1', 'Blush', '2026-05-01T10:00:00Z')])).toEqual(['o1']);
  });

  test('each distinct customer gets its own button', () => {
    const rows = [
      order('o1', 'Blush', '2026-05-01T10:00:00Z'),
      order('o2', 'Casadona', '2026-05-02T10:00:00Z'),
    ];
    expect(eligible(rows)).toEqual(['o1', 'o2']);
  });

  test('only the earliest order of a repeat customer is offered', () => {
    const rows = [
      order('o-late', 'Blush', '2026-06-01T10:00:00Z'),
      order('o-early', 'Blush', '2026-04-01T10:00:00Z'),
      order('o-mid', 'Blush', '2026-05-01T10:00:00Z'),
    ];
    expect(eligible(rows)).toEqual(['o-early']);
  });

  test('the same customer written differently counts once', () => {
    const rows = [
      order('o-late', 'Blush GmbH', '2026-06-01T10:00:00Z'),
      order('o-early', 'S.A.S. Blush', '2026-04-01T10:00:00Z'),
    ];
    expect(eligible(rows)).toEqual(['o-early']);
  });

  test('sorts on the order date, not the row date', () => {
    // A commission row can be written long after the order it belongs to
    // (backfills, re-saves), so the document date is what decides.
    const rows = [
      { ...order('o-a', 'Blush', '2026-04-01T10:00:00Z'), created_at: '2026-09-01T10:00:00Z' },
      { ...order('o-b', 'Blush', '2026-05-01T10:00:00Z'), created_at: '2026-01-01T10:00:00Z' },
    ];
    expect(eligible(rows)).toEqual(['o-a']);
  });
});

describe('eligibleManualBonusRowIds — rows that must not get a button', () => {
  test('a customer who already has a bonus is settled', () => {
    const rows = [
      order('o1', 'Blush', '2026-05-01T10:00:00Z'),
      bonus('b1', 'Blush', 'doc-for-o1'),
    ];
    expect(eligible(rows)).toEqual([]);
  });

  test('a bonus on an EARLIER order blocks a later order for the same customer', () => {
    const rows = [
      order('o-early', 'Blush', '2026-04-01T10:00:00Z'),
      bonus('b1', 'Blush', 'doc-for-o-early'),
      order('o-late', 'Blush', '2026-06-01T10:00:00Z'),
    ];
    expect(eligible(rows)).toEqual([]);
  });

  test('a cancelled bonus does not block — it was never really paid', () => {
    const rows = [
      order('o1', 'Blush', '2026-05-01T10:00:00Z'),
      bonus('b1', 'Blush', 'doc-for-o1', { status: 'cancelled' }),
    ];
    expect(eligible(rows)).toEqual(['o1']);
  });

  test('cancelled orders are ignored', () => {
    const rows = [
      order('o-cancelled', 'Blush', '2026-04-01T10:00:00Z', { status: 'cancelled' }),
      order('o-live', 'Blush', '2026-05-01T10:00:00Z'),
    ];
    expect(eligible(rows)).toEqual(['o-live']);
  });

  test('bonus and manual bonus rows are never themselves eligible', () => {
    const rows = [
      bonus('b1', 'Blush', 'doc-1'),
      { id: 'manual-bonus', type: 'bonus', status: 'pending', created_at: '2026-05-01T10:00:00Z' },
    ];
    expect(eligible(rows)).toEqual([]);
  });

  test('quick orders without a document cannot carry a bonus', () => {
    const rows = [{
      id: 'q1',
      type: 'order',
      status: 'pending',
      created_at: '2026-05-01T10:00:00Z',
      client_label: 'Walk-in Paris',
      document_id: null,
      document: null,
    }];
    expect(eligible(rows)).toEqual([]);
  });

  test('placeholder rows derived from documents are skipped', () => {
    const rows = [order('doc-123', 'Blush', '2026-05-01T10:00:00Z')];
    expect(eligible(rows)).toEqual([]);
  });

  test('an order with no company or contact name is skipped', () => {
    const rows = [order('o1', '   ', '2026-05-01T10:00:00Z')];
    expect(eligible(rows)).toEqual([]);
  });
});

describe('eligibleManualBonusRowIds — agent settings', () => {
  const rows = [order('o1', 'Blush', '2026-05-01T10:00:00Z')];

  test('off means no buttons at all', () => {
    expect(eligible(rows, { agent: { new_client_bonus_mode: 'off', new_client_bonus_amount: 200 } })).toEqual([]);
  });

  test('auto agents can still be topped up by hand', () => {
    expect(eligible(rows, { agent: { new_client_bonus_mode: 'auto', new_client_bonus_amount: 200 } })).toEqual(['o1']);
  });

  test('a legacy agent with only the old boolean behaves like auto', () => {
    expect(eligible(rows, { agent: { new_client_bonus_enabled: true, new_client_bonus_amount: 200 } })).toEqual(['o1']);
    expect(eligible(rows, { agent: { new_client_bonus_enabled: false, new_client_bonus_amount: 200 } })).toEqual([]);
  });

  test('no amount configured means nothing to offer', () => {
    for (const amount of [null, 0, undefined, 'abc']) {
      expect(eligible(rows, { agent: { new_client_bonus_mode: 'manual', new_client_bonus_amount: amount } })).toEqual([]);
    }
  });

  test('no agent at all is off', () => {
    expect(eligible(rows, { agent: null })).toEqual([]);
  });
});

describe('eligibleManualBonusRowIds — defensive', () => {
  test('the document-derived table shows no buttons', () => {
    const rows = [order('o1', 'Blush', '2026-05-01T10:00:00Z')];
    expect(eligible(rows, { isDerived: true })).toEqual([]);
  });

  test('empty and malformed input', () => {
    expect(eligible([])).toEqual([]);
    expect(eligible(null)).toEqual([]);
    expect(eligible(undefined)).toEqual([]);
    expect(eligible([null, undefined, {}])).toEqual([]);
  });

  test('returns a Set, so lookups in the table are cheap', () => {
    const result = eligibleManualBonusRowIds([order('o1', 'Blush', '2026-05-01T10:00:00Z')], { agent: MANUAL_AGENT });
    expect(result).toBeInstanceOf(Set);
    expect(result.has('o1')).toBe(true);
  });

  test('is stable when two orders for one customer share a timestamp', () => {
    const rows = [
      order('o-b', 'Blush', '2026-05-01T10:00:00Z'),
      order('o-a', 'Blush', '2026-05-01T10:00:00Z'),
    ];
    expect(eligible(rows)).toEqual(['o-a']);
    expect(eligible([...rows].reverse())).toEqual(['o-a']);
  });

  test('an unparseable date sorts last instead of winning', () => {
    const rows = [
      order('o-broken', 'Blush', 'not-a-date'),
      order('o-real', 'Blush', '2026-05-01T10:00:00Z'),
    ];
    expect(eligible(rows)).toEqual(['o-real']);
  });
});
