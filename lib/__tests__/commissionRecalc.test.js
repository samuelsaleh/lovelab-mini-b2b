/**
 * @jest-environment node
 *
 * commissionRecalc — when an agent/org rate changes, unpaid unreported
 * order commissions get new amounts; paid + already-reported rows stay put.
 */

const { recalcUnpaidCommissionsForAgent, recalcUnpaidCommissionsForOrganization } = require('../commissionRecalc');

function makeAgentClient(rows) {
  const updates = [];
  return {
    updates,
    from: jest.fn((table) => {
      if (table !== 'agent_commissions') throw new Error('unexpected ' + table);
      const selectChain = {
        select: jest.fn(function () { return this; }),
        eq: jest.fn(function () { return this; }),
        is: jest.fn(function () { return this; }),
        then: (resolve) => resolve({ data: rows, error: null }),
      };
      return {
        ...selectChain,
        update: jest.fn((payload) => ({
          eq: jest.fn((col, id) => {
            updates.push({ id, ...payload });
            return Promise.resolve({ data: null, error: null });
          }),
        })),
      };
    }),
  };
}

describe('recalcUnpaidCommissionsForAgent', () => {
  test('0% → 15% updates unpaid ready rows from order_total', async () => {
    const client = makeAgentClient([
      { id: 'c1', order_total: 1000, status: 'pending', report_id: null, type: 'order' },
      { id: 'c2', order_total: 200, status: 'pending', report_id: null, type: 'order' },
    ]);

    const result = await recalcUnpaidCommissionsForAgent(client, 'agent-1', 15);
    expect(result.updated).toBe(2);
    expect(client.updates).toEqual([
      { id: 'c1', commission_rate: 15, commission_amount: 150 },
      { id: 'c2', commission_rate: 15, commission_amount: 30 },
    ]);
  });

  test('leaves paid rows alone', async () => {
    const client = makeAgentClient([
      { id: 'paid', order_total: 1000, status: 'paid', report_id: null, type: 'order' },
      { id: 'ok', order_total: 1000, status: 'pending', report_id: null, type: 'order' },
    ]);

    const result = await recalcUnpaidCommissionsForAgent(client, 'agent-1', 10);
    expect(result.updated).toBe(1);
    expect(client.updates.map((u) => u.id)).toEqual(['ok']);
  });

  test('query only targets report_id null (reported rows not fetched)', async () => {
    // The helper filters report_id IS NULL in the query — a reported row
    // should never appear in the result set. Simulate empty after filter.
    const client = makeAgentClient([]);
    const result = await recalcUnpaidCommissionsForAgent(client, 'agent-1', 20);
    expect(result.updated).toBe(0);
    expect(client.updates).toHaveLength(0);

    const chain = client.from.mock.results[0].value;
    expect(chain.is).toHaveBeenCalledWith('report_id', null);
    expect(chain.eq).toHaveBeenCalledWith('type', 'order');
  });

  test('skips cancelled and non-order types present in the result set', async () => {
    const client = makeAgentClient([
      { id: 'cancelled', order_total: 500, status: 'cancelled', report_id: null, type: 'order' },
      { id: 'bonus', order_total: 50, status: 'pending', report_id: null, type: 'bonus' },
    ]);
    const result = await recalcUnpaidCommissionsForAgent(client, 'agent-1', 15);
    expect(result.updated).toBe(0);
    expect(client.updates).toHaveLength(0);
  });
});

describe('recalcUnpaidCommissionsForOrganization', () => {
  test('only recalcs members with personal rate 0/null', async () => {
    const agentUpdates = [];
    const client = {
      from: jest.fn((table) => {
        if (table === 'organization_memberships') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockResolvedValue({
              data: [{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'c' }],
              error: null,
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
              data: [
                { id: 'a', commission_rate: 0 },
                { id: 'b', commission_rate: 20 },
                { id: 'c', commission_rate: null },
              ],
              error: null,
            }),
          };
        }
        if (table === 'agent_commissions') {
          const chain = {
            _agent: null,
            select: jest.fn(function () { return this; }),
            eq: jest.fn(function (col, val) {
              if (col === 'agent_id') this._agent = val;
              return this;
            }),
            is: jest.fn(function () { return this; }),
            then: (resolve) => {
              const agent = chain._agent;
              agentUpdates.push(agent);
              resolve({
                data: [{ id: `${agent}-1`, order_total: 1000, status: 'pending', report_id: null, type: 'order' }],
                error: null,
              });
            },
            update: jest.fn(() => ({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            })),
          };
          return chain;
        }
        throw new Error('unexpected ' + table);
      }),
    };

    const result = await recalcUnpaidCommissionsForOrganization(client, 'org-1', 15);
    expect(result.agents).toBe(2); // a and c only
    expect(agentUpdates.sort()).toEqual(['a', 'c']);
    expect(result.updated).toBe(2);
  });
});
