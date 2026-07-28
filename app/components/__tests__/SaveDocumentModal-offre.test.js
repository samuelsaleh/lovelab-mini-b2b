/**
 * @jest-environment node
 *
 * Source-pin: SaveDocumentModal — "Offre" save (admin only)
 *
 * July 2026 — Sam asked for a second parking folder that behaves exactly like
 * Draft but lives on its own admin page. The modal must therefore:
 *   - offer "Enregistrer en Offre" to admins only;
 *   - send status='draft' + draft_kind='offre' (never a new status value, so
 *     every draft protection stays in force);
 *   - never send draft_kind for an ordinary draft/sent save (a database
 *     without the phase-25 migration keeps working);
 *   - keep an Offre an Offre when it is re-edited, and promote it with the
 *     usual "Send Order" primary button.
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'SaveDocumentModal.jsx'),
  'utf8',
);
const ORDER_FORM = fs.readFileSync(
  path.resolve(__dirname, '..', 'OrderForm.jsx'),
  'utf8',
);

describe('SaveDocumentModal — Offre save', () => {
  test('accepts the isOffreOrder prop', () => {
    expect(SOURCE).toMatch(/isOffreOrder\s*=\s*false/);
  });

  test('the Offre button is admin-gated and reuses the draft channels', () => {
    expect(SOURCE).toMatch(
      /const showSaveAsOffre\s*=\s*isAdmin\s*&&\s*canDraft\s*&&\s*\(!editingDocumentId\s*\|\|\s*isOffreOrder\)/,
    );
  });

  test('renders the Offre button and wires it to handleSave', () => {
    expect(SOURCE).toMatch(/showSaveAsOffre\s*&&\s*\(/);
    expect(SOURCE).toMatch(/handleSave\('offre'\)/);
    expect(SOURCE).toMatch(/Enregistrer en Offre/);
  });

  test('an Offre save posts status draft, not a new status value', () => {
    expect(SOURCE).toMatch(
      /const targetStatus\s*=\s*intent === 'sent'\s*\?\s*'sent'\s*:\s*'draft'/,
    );
  });

  test('draft_kind is only sent for an Offre', () => {
    expect(SOURCE).toMatch(
      /\.\.\.\(intent === 'offre'\s*\?\s*\{\s*draft_kind:\s*'offre'\s*\}\s*:\s*\{\}\)/,
    );
    // No unconditional draft_kind in the payload.
    expect(SOURCE).not.toMatch(/\n\s*draft_kind:\s*(?!'offre')/);
  });

  test('editing an Offre hides "Save as draft" so the bucket cannot flip', () => {
    expect(SOURCE).toMatch(
      /const showSaveAsDraft\s*=\s*canDraft\s*&&\s*!isOffreOrder\s*&&/,
    );
  });

  test('the client email stays skipped for a parked order', () => {
    expect(SOURCE).toMatch(/if \(emailEnabled && targetStatus !== 'draft'\)/);
  });

  test('OrderForm derives isOffreOrder from the re-edited document', () => {
    expect(ORDER_FORM).toMatch(/isOffreOrder=\{editingDocumentId/);
    expect(ORDER_FORM).toMatch(/editingDocDraftKind === 'offre'/);
    expect(ORDER_FORM).toMatch(/savedDocDraftKind === 'offre'/);
  });

  test('OrderForm adopts the saved bucket so re-saves stay in the same folder', () => {
    expect(ORDER_FORM).toMatch(/setSavedDocDraftKind\(savedDoc\.draft_kind \|\| null\)/);
  });
});
