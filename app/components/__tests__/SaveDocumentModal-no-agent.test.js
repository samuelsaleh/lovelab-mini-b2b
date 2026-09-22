/**
 * @jest-environment node
 *
 * Source-pin: SaveDocumentModal — "No agent" on an existing order
 *
 * Sam, 22 Sep 2026: an admin editing an order that belongs to an agent must
 * be able to take the agent off it. '' still means "keep the current agent"
 * (so a modal that opened blank never wipes an attribution); the explicit
 * NO_AGENT choice sends agent_id: null, and the current agent is preloaded
 * from the document so the dropdown shows who it is today.
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'SaveDocumentModal.jsx'), 'utf8');

describe('SaveDocumentModal — no agent on an existing order', () => {
  test('exports a distinct NO_AGENT value', () => {
    expect(SOURCE).toMatch(/export const NO_AGENT = '__none__'/);
  });

  test('offers "No agent" on every save and "Keep current agent" only on an edit', () => {
    expect(SOURCE).toMatch(/\{editingDocumentId && <option value="">Keep current agent<\/option>\}/);
    expect(SOURCE).toMatch(/<option value=\{NO_AGENT\}>No agent \(office \/ direct\)<\/option>/);
  });

  test('NO_AGENT is sent as agent_id: null; blank on an edit sends nothing', () => {
    expect(SOURCE).toMatch(/\(!editingDocumentId \|\| selectedAgentId\)\)\s*\?\s*\{ agent_id: selectedAgentId && selectedAgentId !== NO_AGENT \? selectedAgentId : null \}/);
  });

  test('the current agent is preloaded from the document when editing', () => {
    expect(SOURCE).toMatch(/fetch\(`\/api\/documents\/\$\{editingDocumentId\}`/);
    expect(SOURCE).toMatch(/docData\?\.document\?\.agent_id/);
  });

  test('choosing NO_AGENT drops an agent folder but keeps a real fair', () => {
    expect(SOURCE).toMatch(/if \(agentId === NO_AGENT\) \{[\s\S]*?if \(current\?\.type === 'agent'\) setSelectedEventId\(''\)/);
  });
});
