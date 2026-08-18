/**
 * @jest-environment node
 *
 * commissionAttribution — Tier 0 (explicit documents.agent_id).
 *
 * Tier 0 makes the selling agent the source of truth once it is set, so:
 *   ✓ an order an admin typed (created_by = admin) still pays the chosen agent
 *   ✓ a stale / non-agent agent_id is ignored and the heuristic tiers still run
 *   ✓ documents without agent_id behave exactly as before (Tier 1 wins)
 */

import { resolveCommissionAgent } from '@/lib/commissionAttribution';

// Mock admin client. `profilesQueue` lets a test return different rows for the
// successive profiles lookups (Tier 0 probe, then Tier 1 creator, ...).
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
      // thenable so profileCols()'s `.limit(1)` await + any list query resolve
      chain.then = (resolve, reject) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject);
      return chain;
    }),
  };
}

describe('resolveCommissionAgent — Tier 0 (agent_id)', () => {
  test('explicit agent_id wins even when the creator is an admin', async () => {
    // profilesQueue[0] is consumed by profileCols() probe (unused shape), so we
    // put the Tier-0 agent row where the Tier-0 lookup reads it. profileCols
    // uses `.limit(1)` (thenable), NOT maybeSingle, so it does not consume the
    // queue — the first maybeSingle is the Tier-0 lookup.
    const admin = makeAdmin({
      profilesQueue: [
        { id: 'agentX', is_agent: true, agent_status: 'active' }, // Tier 0 hit
      ],
    });
    const r = await resolveCommissionAgent(admin, {
      id: 'd1',
      created_by: 'admin-user',
      event_id: null,
      agent_id: 'agentX',
    });
    expect(r).toMatchObject({ agentId: 'agentX', via: 'agent_id' });
  });

  test('invalid / non-agent agent_id falls through to the creator (Tier 1)', async () => {
    const admin = makeAdmin({
      profilesQueue: [
        null, // Tier 0 lookup: not a valid active agent
        { id: 'creatorAgent', is_agent: true, agent_status: 'active' }, // Tier 1 creator
      ],
    });
    const r = await resolveCommissionAgent(admin, {
      id: 'd1',
      created_by: 'creatorAgent',
      event_id: null,
      agent_id: 'stale-id',
    });
    expect(r).toMatchObject({ agentId: 'creatorAgent', via: 'creator' });
  });

  test('no agent_id → unchanged behaviour (creator wins)', async () => {
    const admin = makeAdmin({
      profilesQueue: [
        { id: 'creatorAgent', is_agent: true, agent_status: 'active' }, // Tier 1 creator
      ],
    });
    const r = await resolveCommissionAgent(admin, {
      id: 'd1',
      created_by: 'creatorAgent',
      event_id: null,
    });
    expect(r).toMatchObject({ agentId: 'creatorAgent', via: 'creator' });
  });
});
