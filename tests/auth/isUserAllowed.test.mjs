import test from 'node:test';
import assert from 'node:assert/strict';

import { isUserAllowed } from '../../lib/auth/isUserAllowed.js';

// ── Allowed-emails path ────────────────────────────────────────────────────

test('allows user whose email is in allowed_emails', () => {
  assert.equal(isUserAllowed({ isInAllowedEmails: true, agentProfile: null }), true);
});

test('allows user in allowed_emails even if they have no agent profile', () => {
  assert.equal(isUserAllowed({ isInAllowedEmails: true, agentProfile: null }), true);
});

test('allows user in allowed_emails even if agent profile is inactive', () => {
  const profile = { is_agent: true, agent_status: 'inactive', agent_deleted_at: null };
  assert.equal(isUserAllowed({ isInAllowedEmails: true, agentProfile: profile }), true);
});

// ── Agent path — allowed statuses ────────────────────────────────────────

test('allows active agent not in allowed_emails', () => {
  const profile = { is_agent: true, agent_status: 'active', agent_deleted_at: null };
  assert.equal(isUserAllowed({ isInAllowedEmails: false, agentProfile: profile }), true);
});

test('allows invited agent not in allowed_emails', () => {
  const profile = { is_agent: true, agent_status: 'invited', agent_deleted_at: null };
  assert.equal(isUserAllowed({ isInAllowedEmails: false, agentProfile: profile }), true);
});

// ── Agent path — blocked statuses ────────────────────────────────────────

test('blocks inactive agent not in allowed_emails', () => {
  const profile = { is_agent: true, agent_status: 'inactive', agent_deleted_at: null };
  assert.equal(isUserAllowed({ isInAllowedEmails: false, agentProfile: profile }), false);
});

test('blocks paused agent not in allowed_emails', () => {
  const profile = { is_agent: true, agent_status: 'paused', agent_deleted_at: null };
  assert.equal(isUserAllowed({ isInAllowedEmails: false, agentProfile: profile }), false);
});

test('blocks soft-deleted active agent not in allowed_emails', () => {
  const profile = { is_agent: true, agent_status: 'active', agent_deleted_at: '2026-01-01T00:00:00Z' };
  assert.equal(isUserAllowed({ isInAllowedEmails: false, agentProfile: profile }), false);
});

test('blocks soft-deleted invited agent not in allowed_emails', () => {
  const profile = { is_agent: true, agent_status: 'invited', agent_deleted_at: '2026-01-01T00:00:00Z' };
  assert.equal(isUserAllowed({ isInAllowedEmails: false, agentProfile: profile }), false);
});

// ── Non-agent path ────────────────────────────────────────────────────────

test('blocks non-agent profile not in allowed_emails', () => {
  const profile = { is_agent: false, agent_status: null, agent_deleted_at: null };
  assert.equal(isUserAllowed({ isInAllowedEmails: false, agentProfile: profile }), false);
});

test('blocks null profile not in allowed_emails', () => {
  assert.equal(isUserAllowed({ isInAllowedEmails: false, agentProfile: null }), false);
});

test('blocks profile with is_agent=null not in allowed_emails', () => {
  const profile = { is_agent: null, agent_status: 'active', agent_deleted_at: null };
  assert.equal(isUserAllowed({ isInAllowedEmails: false, agentProfile: profile }), false);
});

// ── Edge cases ────────────────────────────────────────────────────────────

test('blocks agent with unknown status not in allowed_emails', () => {
  const profile = { is_agent: true, agent_status: 'unknown_future_status', agent_deleted_at: null };
  assert.equal(isUserAllowed({ isInAllowedEmails: false, agentProfile: profile }), false);
});

test('blocks agent with null status not in allowed_emails', () => {
  const profile = { is_agent: true, agent_status: null, agent_deleted_at: null };
  assert.equal(isUserAllowed({ isInAllowedEmails: false, agentProfile: profile }), false);
});
