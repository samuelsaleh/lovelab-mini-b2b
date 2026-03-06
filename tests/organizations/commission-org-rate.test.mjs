import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the org-level commission rate fallback logic.
 * The actual logic lives in app/api/documents/route.js POST handler,
 * but we test the decision pattern here in isolation.
 */

function resolveEffectiveRate(agentProfile, organization) {
  let effectiveRate = agentProfile?.commission_rate || 0;
  if (!effectiveRate && agentProfile?.organization_id && organization) {
    effectiveRate = organization.commission_rate || 0;
  }
  return effectiveRate;
}

test('agent with personal rate uses personal rate', () => {
  const agent = { commission_rate: 15, organization_id: 'org-1' };
  const org = { commission_rate: 10 };
  assert.equal(resolveEffectiveRate(agent, org), 15);
});

test('agent with rate=0 falls back to org rate', () => {
  const agent = { commission_rate: 0, organization_id: 'org-1' };
  const org = { commission_rate: 12 };
  assert.equal(resolveEffectiveRate(agent, org), 12);
});

test('agent with null rate falls back to org rate', () => {
  const agent = { commission_rate: null, organization_id: 'org-1' };
  const org = { commission_rate: 8 };
  assert.equal(resolveEffectiveRate(agent, org), 8);
});

test('agent with no org gets rate=0', () => {
  const agent = { commission_rate: 0, organization_id: null };
  assert.equal(resolveEffectiveRate(agent, null), 0);
});

test('org exists but has no rate set -- falls back to 0', () => {
  const agent = { commission_rate: 0, organization_id: 'org-1' };
  const org = { commission_rate: null };
  assert.equal(resolveEffectiveRate(agent, org), 0);
});

test('org rate=0 does not override agent rate', () => {
  const agent = { commission_rate: 20, organization_id: 'org-1' };
  const org = { commission_rate: 0 };
  assert.equal(resolveEffectiveRate(agent, org), 20);
});

test('both agent and org have rate=0 results in 0', () => {
  const agent = { commission_rate: 0, organization_id: 'org-1' };
  const org = { commission_rate: 0 };
  assert.equal(resolveEffectiveRate(agent, org), 0);
});

test('agent without organization_id ignores org even if provided', () => {
  const agent = { commission_rate: 0 };
  const org = { commission_rate: 25 };
  assert.equal(resolveEffectiveRate(agent, org), 0);
});

test('null agent profile returns 0', () => {
  assert.equal(resolveEffectiveRate(null, null), 0);
  assert.equal(resolveEffectiveRate(undefined, { commission_rate: 10 }), 0);
});
