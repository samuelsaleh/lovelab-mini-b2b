/**
 * Auth callback flow tests.
 *
 * These tests exercise the core decision logic of the auth callback
 * without hitting real Supabase or Next.js infrastructure.
 *
 * Strategy: extract the same decision logic used in the route handler into
 * pure simulation functions, verify each scenario, and keep them in sync with
 * the real implementation. This matches the pattern used across this test suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { isUserAllowed } from '../../lib/auth/isUserAllowed.js';

// ── Simulation helpers ────────────────────────────────────────────────────

/**
 * Simulates the full auth callback decision given sign-in type and user state.
 *
 * @param {object} opts
 * @param {'oauth'|'magic_link'} opts.signInMethod - 'oauth' (code) or 'magic_link' (token_hash)
 * @param {boolean} opts.isInAllowedEmails
 * @param {object|null} opts.agentProfile - profile fields relevant to the gate
 * @param {boolean} opts.hasPasswordSet - value of has_password_set in profile
 * @returns {'allowed'|'access_denied'|'auth_error'|'set_password'}
 */
function simulateCallbackDecision({
  signInMethod,
  isInAllowedEmails,
  agentProfile,
  hasPasswordSet = true,
  sessionSuccess = true,
}) {
  // Step 1: session exchange
  if (!sessionSuccess) return 'auth_error';

  // Step 2: access gate
  const allowed = isUserAllowed({ isInAllowedEmails, agentProfile });
  if (!allowed) return 'access_denied';

  // Step 3: set-password redirect only for magic link, not OAuth
  const isOAuth = signInMethod === 'oauth';
  const needsPassword = !isOAuth && agentProfile?.is_agent === true && hasPasswordSet === false;
  if (needsPassword) return 'set_password';

  return 'allowed';
}

// ── Scenario 1: New user invited as agent, first Google OAuth sign-in ─────

test('new agent (not in allowed_emails) signs in via Google OAuth — allowed, no set-password', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'oauth',
    isInAllowedEmails: false,
    agentProfile: { is_agent: true, agent_status: 'invited', agent_deleted_at: null },
    hasPasswordSet: false,
  });
  assert.equal(result, 'allowed');
});

// ── Scenario 2: Existing user invited as agent, Google OAuth sign-in ──────

test('existing user upgraded to agent signs in via Google OAuth — allowed', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'oauth',
    isInAllowedEmails: true,   // now in allowed_emails after the bug fix
    agentProfile: { is_agent: true, agent_status: 'active', agent_deleted_at: null },
    hasPasswordSet: false,
  });
  assert.equal(result, 'allowed');
});

test('existing user upgraded to agent (not yet in allowed_emails) signs in via Google OAuth — still allowed via agent path', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'oauth',
    isInAllowedEmails: false,
    agentProfile: { is_agent: true, agent_status: 'active', agent_deleted_at: null },
    hasPasswordSet: false,
  });
  assert.equal(result, 'allowed');
});

// ── Scenario 3: Soft-deleted agent tries Google OAuth ────────────────────

test('soft-deleted agent signs in via Google OAuth — access_denied', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'oauth',
    isInAllowedEmails: false,
    agentProfile: { is_agent: true, agent_status: 'active', agent_deleted_at: '2026-01-01T00:00:00Z' },
  });
  assert.equal(result, 'access_denied');
});

test('soft-deleted agent removed from allowed_emails signs in via Google OAuth — access_denied', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'oauth',
    isInAllowedEmails: false,
    agentProfile: { is_agent: true, agent_status: 'inactive', agent_deleted_at: '2026-01-01T00:00:00Z' },
  });
  assert.equal(result, 'access_denied');
});

// ── Scenario 4: Paused or inactive agent ─────────────────────────────────

test('paused agent not in allowed_emails signs in via Google OAuth — access_denied', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'oauth',
    isInAllowedEmails: false,
    agentProfile: { is_agent: true, agent_status: 'paused', agent_deleted_at: null },
  });
  assert.equal(result, 'access_denied');
});

test('inactive agent not in allowed_emails signs in via Google OAuth — access_denied', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'oauth',
    isInAllowedEmails: false,
    agentProfile: { is_agent: true, agent_status: 'inactive', agent_deleted_at: null },
  });
  assert.equal(result, 'access_denied');
});

// ── Scenario 5: Magic link sign-in triggers set-password ─────────────────

test('agent signs in via magic link with has_password_set=false — redirected to set-password', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'magic_link',
    isInAllowedEmails: true,
    agentProfile: { is_agent: true, agent_status: 'invited', agent_deleted_at: null },
    hasPasswordSet: false,
  });
  assert.equal(result, 'set_password');
});

test('agent signs in via magic link with has_password_set=true — allowed directly', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'magic_link',
    isInAllowedEmails: true,
    agentProfile: { is_agent: true, agent_status: 'active', agent_deleted_at: null },
    hasPasswordSet: true,
  });
  assert.equal(result, 'allowed');
});

test('OAuth sign-in never triggers set-password regardless of has_password_set', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'oauth',
    isInAllowedEmails: true,
    agentProfile: { is_agent: true, agent_status: 'active', agent_deleted_at: null },
    hasPasswordSet: false,
  });
  assert.equal(result, 'allowed');
});

// ── Session failure ───────────────────────────────────────────────────────

test('session exchange failure returns auth_error', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'oauth',
    isInAllowedEmails: true,
    agentProfile: { is_agent: true, agent_status: 'active', agent_deleted_at: null },
    sessionSuccess: false,
  });
  assert.equal(result, 'auth_error');
});

// ── Internal team member (non-agent in allowed_emails) ───────────────────

test('internal team member (non-agent) in allowed_emails signs in via OAuth — allowed', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'oauth',
    isInAllowedEmails: true,
    agentProfile: { is_agent: false, agent_status: null, agent_deleted_at: null },
  });
  assert.equal(result, 'allowed');
});

test('unknown user not in allowed_emails and no agent profile — access_denied', () => {
  const result = simulateCallbackDecision({
    signInMethod: 'oauth',
    isInAllowedEmails: false,
    agentProfile: null,
  });
  assert.equal(result, 'access_denied');
});
