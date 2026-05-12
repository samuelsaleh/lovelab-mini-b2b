/**
 * @jest-environment node
 *
 * Source-pin: SaveDocumentModal auto-creates missing agent folders
 *
 * Phase 21 — when the modal opens, admins see a per-agent dropdown. If a
 * new agent has no folder yet, the modal auto-creates one. We need that
 * folder to (a) be linked to the agent's organization_id (otherwise Tier
 * 2 commission attribution silently skips every order saved into it),
 * and (b) skip creation if a folder for that org already exists under a
 * different display name (otherwise the dropdown grows duplicates every
 * time the modal opens — exactly the "Corinne Ruimy AND CORINNE SECRET
 * CODE PARIS" duplicate Sam reported).
 *
 * This is a static source-pin (not a runtime jsdom test) because the full
 * modal pulls i18n + Supabase client state that isn't worth bootstrapping
 * here, and the entire fix lives in a small block of literal source.
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'SaveDocumentModal.jsx'),
  'utf8',
);

describe('SaveDocumentModal — auto-create agent folder respects organization_id', () => {
  test('builds a Set of existing folder organization_ids', () => {
    expect(SOURCE).toMatch(
      /const\s+existingAgentOrgs\s*=\s*new Set\(\s*agentEvents\.map\(/,
    );
    expect(SOURCE).toMatch(/\.organization_id\b/);
  });

  test('skips auto-create when an agent folder already exists for the same org_id', () => {
    expect(SOURCE).toMatch(
      /existingAgentOrgs\.has\(\s*a\.organization_id\s*\)/,
    );
  });

  test('passes organization_id when POSTing to /api/events', () => {
    // The auto-create call must include organization_id so the new
    // folder is Tier 2-attributable from the very first order saved
    // into it.
    expect(SOURCE).toMatch(
      /body:\s*JSON\.stringify\(\{[\s\S]*?type:\s*'agent'[\s\S]*?organization_id:\s*a\.organization_id[\s\S]*?\}\)/,
    );
  });

  test('still POSTs to /api/events for actually-missing folders', () => {
    expect(SOURCE).toMatch(/fetch\(\s*'\/api\/events'/);
  });
});
