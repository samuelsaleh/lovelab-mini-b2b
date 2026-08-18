/**
 * @jest-environment node
 *
 * Source-pin: SaveDocumentModal auto-creates missing agent folders
 *
 * July 2026 — multi-member orgs (Sarah + Wassila + …) each get their own
 * agent folder in the save picker. Solo orgs still skip create when the
 * org already has a folder (Corinne rename guard).
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'SaveDocumentModal.jsx'),
  'utf8',
);

describe('SaveDocumentModal — auto-create agent folders for sub-agents', () => {
  test('tracks agents-per-org for the solo-org rename guard', () => {
    expect(SOURCE).toMatch(/agentsPerOrg/);
    expect(SOURCE).toMatch(/agentsPerOrg\.get\(a\.organization_id\)/);
  });

  test('solo-org rename guard skips create when org already has a folder', () => {
    expect(SOURCE).toMatch(/existingAgentOrgs\.has\(a\.organization_id\)/);
    expect(SOURCE).toMatch(/\(\s*agentsPerOrg\.get\(a\.organization_id\)\s*\|\|\s*0\s*\)\s*<=\s*1/);
  });

  test('does NOT blankly skip every agent sharing an organization_id', () => {
    // Old Phase 21 line that blocked all sub-agents — must be gone.
    expect(SOURCE).not.toMatch(
      /if\s*\(\s*a\.organization_id\s*&&\s*existingAgentOrgs\.has\(\s*a\.organization_id\s*\)\s*\)\s*return\s*false\s*;/,
    );
  });

  test('passes organization_id when POSTing to /api/events', () => {
    expect(SOURCE).toMatch(
      /body:\s*JSON\.stringify\(\{[\s\S]*?type:\s*'agent'[\s\S]*?organization_id:\s*a\.organization_id[\s\S]*?\}\)/,
    );
  });

  test('still POSTs to /api/events for actually-missing folders', () => {
    expect(SOURCE).toMatch(/fetch\(\s*'\/api\/events'/);
  });

  test('choosing an agent automatically selects that agent folder', () => {
    expect(SOURCE).toMatch(/findAgentFolderEvent\(events,\s*selectedAgent\)/);
    expect(SOURCE).toMatch(/setSelectedEventId\(agentFolder\?\.id\s*\|\|\s*''\)/);
  });

  test('admins do not silently default to the first unrelated event', () => {
    expect(SOURCE).toMatch(/!isAdmin\s*&&\s*allEvents\.length\s*>\s*0/);
  });
});
