/**
 * @jest-environment node
 *
 * commissionAttribution — the explicit "no agent" choice (metadata.no_agent).
 *
 * Sam, 22 Sep 2026: an admin took an order away from Bastian with "No agent";
 * the save cleared agent_id but the creator fallback (Tier 1) re-credited him.
 *   ✓ metadata.no_agent wins over every tier, creator included
 *   ✓ without the flag, a null agent_id still falls back to the creator
 *   ✓ removePendingOrderCommissions deletes only pending order rows
 */

import { resolveCommissionAgent, removePendingOrderCommissions } from '@/lib/commissionAttribution';

function makeAdmin({ profilesQueue = [] }) {
  let profileCall = 0;
  return {
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
          const row = profilesQueue[profileCall] ?? null;
          profileCall += 1;
          return Promise.resolve({ data: row, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
      chain.then = (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
      return chain;
    }),
  };
}

describe('resolveCommissionAgent — metadata.no_agent', () => {
  const bastian = { id: 'bastian', is_agent: true, agent_status: 'active' };

  test('the flag returns null even though the creator is an active agent', async () => {
    const admin = makeAdmin({ profilesQueue: [bastian] });
    const r = await resolveCommissionAgent(admin, {
      id: 'd1', created_by: 'bastian', agent_id: null, event_id: null, metadata: { no_agent: true },
    });
    expect(r).toBeNull();
    // Nothing was looked up: the choice short-circuits every tier.
    expect(admin.from).not.toHaveBeenCalledWith('profiles');
  });

  test('without the flag a null agent_id still falls back to the creator', async () => {
    const admin = makeAdmin({ profilesQueue: [bastian] });
    const r = await resolveCommissionAgent(admin, {
      id: 'd1', created_by: 'bastian', agent_id: null, event_id: null, metadata: {},
    });
    expect(r).toMatchObject({ agentId: 'bastian', via: 'creator' });
  });

  test('a stray false or string value is not a flag', async () => {
    const admin = makeAdmin({ profilesQueue: [bastian] });
    const r = await resolveCommissionAgent(admin, {
      id: 'd1', created_by: 'bastian', agent_id: null, event_id: null, metadata: { no_agent: 'true' },
    });
    expect(r).toMatchObject({ agentId: 'bastian' });
  });
});

describe('removePendingOrderCommissions', () => {
  function deletingAdmin(rows, error = null) {
    const calls = { eq: [] };
    const chain = {
      delete: jest.fn(() => chain),
      eq: jest.fn((col, val) => { calls.eq.push([col, val]); return chain; }),
      select: jest.fn(async () => ({ data: rows, error })),
    };
    return { admin: { from: jest.fn(() => chain) }, chain, calls };
  }

  test('deletes only the pending order rows of that document', async () => {
    const { admin, chain, calls } = deletingAdmin([{ id: 'c1' }, { id: 'c2' }]);
    const out = await removePendingOrderCommissions(admin, 'doc-1');
    expect(out).toEqual({ deleted: 2 });
    expect(admin.from).toHaveBeenCalledWith('agent_commissions');
    expect(chain.delete).toHaveBeenCalled();
    expect(calls.eq).toEqual([['document_id', 'doc-1'], ['type', 'order'], ['status', 'pending']]);
  });

  test('no document id is a no-op; a DB error is thrown for the caller to record', async () => {
    const { admin } = deletingAdmin([]);
    expect(await removePendingOrderCommissions(admin, null)).toEqual({ deleted: 0 });
    expect(admin.from).not.toHaveBeenCalled();
    const bad = deletingAdmin(null, new Error('boom'));
    await expect(removePendingOrderCommissions(bad.admin, 'doc-1')).rejects.toThrow('boom');
  });
});
