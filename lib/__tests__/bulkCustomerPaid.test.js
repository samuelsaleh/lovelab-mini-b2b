/**
 * @jest-environment node
 *
 * lib/bulkCustomerPaid.js — client-side helpers behind the Paid? checkbox
 * and the bulk Paid?/Unpaid action on the agent detail page.
 *
 * The local cascade must mirror the server cascade in
 * /api/commissions/[id]/customer-paid exactly, otherwise the optimistic UI
 * and the database disagree until the next refresh.
 */

const {
  applyCustomerPaidLocally,
  selectableForBulk,
  sendBulkCustomerPaid,
} = require('../bulkCustomerPaid');

const TS = '2026-08-12T10:00:00.000Z';

function rows() {
  return [
    { id: 'order-1', type: 'order', agent_id: 'agent-1', document_id: 'doc-1', customer_paid_at: null },
    { id: 'bonus-1', type: 'new_client_bonus', agent_id: 'agent-1', document_id: 'doc-1', customer_paid_at: null },
    { id: 'order-2', type: 'order', agent_id: 'agent-1', document_id: 'doc-2', customer_paid_at: null },
    { id: 'bonus-2', type: 'new_client_bonus', agent_id: 'agent-1', document_id: 'doc-2', customer_paid_at: null },
    // Same document id, different agent — must never be dragged along.
    { id: 'bonus-other-agent', type: 'new_client_bonus', agent_id: 'agent-2', document_id: 'doc-1', customer_paid_at: null },
    // Manual bonus with no document link.
    { id: 'bonus-manual', type: 'new_client_bonus', agent_id: 'agent-1', document_id: null, customer_paid_at: null },
    // Manual order with no document link.
    { id: 'order-manual', type: 'order', agent_id: 'agent-1', document_id: null, customer_paid_at: null },
  ];
}

const byId = (list) => Object.fromEntries(list.map((r) => [r.id, r.customer_paid_at]));

describe('applyCustomerPaidLocally', () => {
  test('ticking an order also ticks the linked bonus for the same agent + document', () => {
    const out = applyCustomerPaidLocally(rows(), ['order-1'], true, TS);
    expect(byId(out)['order-1']).toBe(TS);
    expect(byId(out)['bonus-1']).toBe(TS);
  });

  test('does not touch the bonus of another agent sharing the document id', () => {
    const out = applyCustomerPaidLocally(rows(), ['order-1'], true, TS);
    expect(byId(out)['bonus-other-agent']).toBeNull();
  });

  test('leaves unrelated rows alone', () => {
    const out = applyCustomerPaidLocally(rows(), ['order-1'], true, TS);
    expect(byId(out)['order-2']).toBeNull();
    expect(byId(out)['bonus-2']).toBeNull();
    expect(byId(out)['bonus-manual']).toBeNull();
  });

  test('a bonus row toggled on its own does not cascade onto anything', () => {
    const out = applyCustomerPaidLocally(rows(), ['bonus-1'], true, TS);
    expect(byId(out)['bonus-1']).toBe(TS);
    expect(byId(out)['order-1']).toBeNull();
    expect(byId(out)['bonus-other-agent']).toBeNull();
  });

  test('an order without a document_id cascades onto nothing', () => {
    const out = applyCustomerPaidLocally(rows(), ['order-manual'], true, TS);
    expect(byId(out)['order-manual']).toBe(TS);
    expect(byId(out)['bonus-manual']).toBeNull();
  });

  test('unticking clears the order and its linked bonus', () => {
    const paid = rows().map((r) => ({ ...r, customer_paid_at: TS }));
    const out = applyCustomerPaidLocally(paid, ['order-1'], false);
    expect(byId(out)['order-1']).toBeNull();
    expect(byId(out)['bonus-1']).toBeNull();
    expect(byId(out)['order-2']).toBe(TS);
  });

  test('handles multiple ids in one pass, cascading each', () => {
    const out = applyCustomerPaidLocally(rows(), ['order-1', 'order-2'], true, TS);
    expect(byId(out)['order-1']).toBe(TS);
    expect(byId(out)['bonus-1']).toBe(TS);
    expect(byId(out)['order-2']).toBe(TS);
    expect(byId(out)['bonus-2']).toBe(TS);
    expect(byId(out)['bonus-other-agent']).toBeNull();
  });

  test('defaults to a fresh ISO timestamp when none is supplied', () => {
    const out = applyCustomerPaidLocally(rows(), ['order-1'], true);
    expect(byId(out)['order-1']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('returns the list untouched when no ids are given', () => {
    const input = rows();
    expect(applyCustomerPaidLocally(input, [], true)).toBe(input);
  });

  test('tolerates null rows / null ids', () => {
    expect(applyCustomerPaidLocally(null, ['x'], true)).toEqual([]);
    expect(applyCustomerPaidLocally(rows(), null, true)).toHaveLength(7);
  });

  test('does not mutate the input array or its rows', () => {
    const input = rows();
    const snapshot = JSON.stringify(input);
    applyCustomerPaidLocally(input, ['order-1'], true, TS);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('selectableForBulk', () => {
  test('drops rows already in the requested state', () => {
    const list = [
      { id: 'a', customer_paid_at: null },
      { id: 'b', customer_paid_at: TS },
      { id: 'c', customer_paid_at: null },
    ];
    expect(selectableForBulk(list, ['a', 'b', 'c'], true)).toEqual(['a', 'c']);
    expect(selectableForBulk(list, ['a', 'b', 'c'], false)).toEqual(['b']);
  });

  test('ignores ids that are not in the list', () => {
    const list = [{ id: 'a', customer_paid_at: null }];
    expect(selectableForBulk(list, ['a', 'ghost'], true)).toEqual(['a']);
  });

  test('returns an empty array when nothing needs changing', () => {
    const list = [{ id: 'a', customer_paid_at: TS }];
    expect(selectableForBulk(list, ['a'], true)).toEqual([]);
  });
});

describe('sendBulkCustomerPaid', () => {
  test('sends one PATCH with the ids and paid flag', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ updated_count: 2 }),
    });
    const json = await sendBulkCustomerPaid(['a', 'b'], true, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/commissions/customer-paid-bulk');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ ids: ['a', 'b'], paid: true });
    expect(json.updated_count).toBe(2);
  });

  test('throws the server error message on a non-2xx', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Too many ids (max 200)' }),
    });
    await expect(sendBulkCustomerPaid(['a'], true, fetchImpl)).rejects.toThrow('Too many ids (max 200)');
  });

  test('throws a generic error when the body is not JSON', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => { throw new Error('not json'); },
    });
    await expect(sendBulkCustomerPaid(['a'], true, fetchImpl)).rejects.toThrow('Failed to update commissions');
  });
});
