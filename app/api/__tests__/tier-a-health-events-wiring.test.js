/**
 * @jest-environment node
 *
 * Tier A silent-catch wiring — regression test.
 *
 * Verifies that the three known Tier A failure sites still funnel into
 * recordHealthEvent with stable source identifiers and severity ≥ 'error'.
 * The unit tests in lib/__tests__/healthEvent.test.js prove the helper itself
 * works; this file proves we never silently un-wire it during a refactor.
 *
 * Source identifiers must stay stable so the eventual /admin/health dashboard
 * and the throttle keys keep working. Update this test only when you also
 * update the dashboard.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..');

const TIER_A_SITES = [
  {
    file: 'app/api/documents/route.js',
    source: 'documents_post_commission_hook',
    purpose: 'Commission auto-create on document save',
  },
  {
    file: 'app/api/documents/[id]/route.js',
    source: 'documents_put_commission_recalc',
    purpose: 'Commission recalc on document edit',
  },
  {
    file: 'app/api/agents/[id]/route.js',
    source: 'agents_delete_revoke_sessions',
    purpose: 'Session revocation after agent soft-delete',
  },
];

// Phase 19 — bonus hook sites use severity 'warn' (a bonus failure is
// recoverable since the order commission still saved). Tested separately
// so the severity assertion above stays strict for the commission paths.
const BONUS_HOOK_SITES = [
  {
    file: 'app/api/documents/route.js',
    source: 'documents_post_new_client_bonus_hook',
    purpose: 'New-client bonus auto-create on document save',
  },
  {
    file: 'app/api/documents/[id]/route.js',
    source: 'documents_put_new_client_bonus_hook',
    purpose: 'New-client bonus recalc on document edit',
  },
];

describe.each(TIER_A_SITES)('Tier A wiring — $purpose ($file)', ({ file, source }) => {
  const src = readFileSync(resolve(ROOT, file), 'utf8');

  test('imports recordHealthEvent', () => {
    expect(src).toMatch(/import\s*\{[^}]*recordHealthEvent[^}]*\}\s*from\s*['"]@\/lib\/healthEvent['"]/);
  });

  test(`uses source identifier '${source}'`, () => {
    expect(src).toMatch(new RegExp(`source:\\s*['"]${source}['"]`));
  });

  test('uses severity error or critical', () => {
    expect(src).toMatch(/severity:\s*['"](error|critical)['"]/);
  });

  test('does not silently swallow with bare console.error in this catch', () => {
    // This is a soft check: we look for the legacy "Commission hook error
    // (non-blocking)" / "Commission recalc error (non-blocking)" /
    // "Session revocation error (non-blocking)" strings and assert they're
    // gone. They were the markers of Tier A swallowing.
    expect(src).not.toMatch(/Commission hook error \(non-blocking\)/);
    expect(src).not.toMatch(/Commission recalc error \(non-blocking\)/);
    expect(src).not.toMatch(/Session revocation error \(non-blocking\)/);
  });
});

describe.each(BONUS_HOOK_SITES)('New-client bonus wiring — $purpose ($file)', ({ file, source }) => {
  const src = readFileSync(resolve(ROOT, file), 'utf8');

  test('imports maybeCreateBonusForOrder', () => {
    expect(src).toMatch(/import\s*\{[^}]*maybeCreateBonusForOrder[^}]*\}\s*from\s*['"]@\/lib\/newClientBonus['"]/);
  });

  test(`uses bonus source identifier '${source}'`, () => {
    expect(src).toMatch(new RegExp(`source:\\s*['"]${source}['"]`));
  });

  test('uses severity warn (recoverable since order commission already saved)', () => {
    // Find the source line and confirm the surrounding recordHealthEvent
    // block uses severity 'warn'. The block is small (~400 chars) so a
    // generous symmetric window catches both before- and after-source
    // severity orderings.
    const sourceIdx = src.indexOf(`source: '${source}'`);
    expect(sourceIdx).toBeGreaterThan(-1);
    const ctx = src.slice(Math.max(0, sourceIdx - 200), sourceIdx + 400);
    expect(ctx).toMatch(/severity:\s*['"]warn['"]/);
  });
});
