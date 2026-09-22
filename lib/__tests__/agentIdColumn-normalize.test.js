/**
 * normalizeAgentId — what the documents PUT/PATCH routes store as agent_id.
 * An explicit null clears the agent (Sam, 22 Sep 2026: "no agent" on an
 * existing order); a valid active agent id is kept; an unknown id is dropped.
 */
import { normalizeAgentId } from '@/lib/agentIdColumn';

function adminWith(agent) {
  const q = {
    select: jest.fn(() => q), eq: jest.fn(() => q), in: jest.fn(() => q), is: jest.fn(() => q),
    maybeSingle: jest.fn(async () => ({ data: agent, error: null })),
  };
  return { from: jest.fn(() => q) };
}

describe('normalizeAgentId', () => {
  test('null clears the agent, even when the creator is an agent-less office user', async () => {
    expect(await normalizeAgentId(adminWith(null), null, { creatorId: 'office-1' })).toBeNull();
  });

  test('a valid active agent id is stored as is', async () => {
    expect(await normalizeAgentId(adminWith({ id: 'agent-1' }), 'agent-1', { creatorId: 'office-1' })).toBe('agent-1');
  });

  test('an unknown or inactive id is dropped rather than stored', async () => {
    expect(await normalizeAgentId(adminWith(null), 'ghost', { creatorId: 'office-1' })).toBeNull();
  });

  test('blank on an order created by an agent falls back to that agent only when told so', async () => {
    expect(await normalizeAgentId(adminWith(null), '', { creatorId: 'agent-2', creatorIsAgent: true })).toBe('agent-2');
    expect(await normalizeAgentId(adminWith(null), '', { creatorId: 'agent-2' })).toBeNull();
  });
});
