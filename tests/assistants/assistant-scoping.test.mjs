import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ─────────────────────────────────────────────────────────────────────────────
// Route wiring — static source assertions (the routes need Next.js to run;
// these assertions pin the commercial-assistant contract at the source level,
// same pattern as tests/api/documents-org-scope.test.mjs).
// ─────────────────────────────────────────────────────────────────────────────

const documentsSrc = readFileSync(join(repoRoot, 'app/api/documents/route.js'), 'utf8');
const accessSrc = readFileSync(join(repoRoot, 'app/api/_lib/access.js'), 'utf8');
const assistantsListSrc = readFileSync(join(repoRoot, 'app/api/assistants/route.js'), 'utf8');
const assistantDetailSrc = readFileSync(join(repoRoot, 'app/api/assistants/[id]/route.js'), 'utf8');
const authProviderSrc = readFileSync(join(repoRoot, 'app/components/AuthProvider.jsx'), 'utf8');

test('documents POST rejects a sent assistant document without a fair (400)', () => {
  assert.match(
    documentsSrc,
    /isAssistantUser && !isDraft && !effectiveEventId[\s\S]{0,300}status: 400/,
    'assistants must pick one of their fairs before saving'
  );
});

test('documents POST never auto-files assistants into an agent folder', () => {
  assert.ok(
    documentsSrc.includes("!isAssistantUser && ['b2b', 'b2c'].includes(safeOrderChannel)"),
    'the agent auto-file fallback must exclude assistants — it would fabricate an agent folder'
  );
});

test('an agent who is also flagged assistant keeps the agent flow', () => {
  assert.ok(
    documentsSrc.includes('isAssistant && !profile?.is_agent'),
    'only pure assistants (not agents) get the assistant restrictions'
  );
});

test('documents GET annotates assistant-created docs without touching the embed', () => {
  assert.ok(documentsSrc.includes('creator_is_assistant'), 'annotation flag must exist');
  assert.match(
    documentsSrc,
    /try \{[\s\S]{0,600}\.eq\('is_assistant', true\)[\s\S]{0,600}catch/,
    'annotation must be wrapped in try/catch so a missing column never 500s the list'
  );
});

test('getUserContext exposes isAssistant and never grants it to admins', () => {
  assert.ok(accessSrc.includes("isAssistant: profile?.role !== 'admin' && Boolean(profile?.is_assistant)"));
});

test('getUserContext survives a DB without the is_assistant column', () => {
  assert.match(
    accessSrc,
    /if \(profileErr\)[\s\S]{0,300}'id, role, is_agent, full_name, email'/,
    'must retry the profile select without is_assistant when the migration is missing'
  );
});

test('assistants list/invite endpoints are admin-only', () => {
  const guards = assistantsListSrc.match(/if \(!isAdmin\(session\.profile\)\)/g) || [];
  assert.ok(guards.length >= 2, 'both GET and POST must check isAdmin');
});

test('assistant detail endpoints are admin-only and scoped to assistants', () => {
  assert.ok(assistantDetailSrc.includes('if (!isAdmin(session.profile))'));
  assert.ok(assistantDetailSrc.includes(".eq('is_assistant', true)"), 'must only operate on assistant profiles');
});

test('inviting an assistant requires at least one fair', () => {
  assert.match(assistantsListSrc, /Select at least one fair[\s\S]{0,80}status: 400/);
});

test('removing an assistant never locks out admins or agents', () => {
  assert.ok(
    assistantDetailSrc.includes("!assistant.is_agent && assistant.role !== 'admin'"),
    'allowed_emails revocation must skip agents and admins'
  );
});

test('removing an assistant revokes sessions and fair access', () => {
  assert.ok(assistantDetailSrc.includes("rpc('revoke_user_sessions'"), 'refresh tokens must be invalidated');
  assert.match(assistantDetailSrc, /from\('event_access'\)[\s\S]{0,60}\.delete\(\)/);
});

test('assistants are forced through /set-password on first login', () => {
  assert.ok(
    authProviderSrc.includes('if (!profile.is_agent && !profile.is_assistant) return;'),
    'the temp-password gate must cover assistants, not just agents'
  );
});
