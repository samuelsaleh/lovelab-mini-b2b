/**
 * @jest-environment node
 *
 * Source-pin: drafts (and orders) must never save double (Sam, July 2026).
 *
 * Observed: "tom-bv" and "EURL BIJOUTERIE GRANDEMANGE" each existed twice in
 * the Draft folder, saved 1–5 minutes apart with different save_request_ids.
 * Two holes:
 *
 *  1. Same-session re-save: after "Save as draft", OrderForm kept
 *     editingDocumentId = null, so the next Save POSTed a brand-new document
 *     instead of updating the one just created.
 *  2. Double-click: `saving` state disables the buttons only after a render,
 *     so two rapid clicks could start handleSave twice; both passed the
 *     server's idempotency pre-check before either inserted.
 *
 * Static source-pin (same pattern as SaveDocumentModal-auto-create-org /
 * -pdf-retry) because the full modal needs i18n + Supabase + PDF generation
 * that isn't worth bootstrapping; each fix is a small, literal block.
 */

const fs = require('node:fs');
const path = require('node:path');

const MODAL_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'SaveDocumentModal.jsx'),
  'utf8',
);
const ORDER_FORM_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'OrderForm.jsx'),
  'utf8',
);

describe('SaveDocumentModal — no duplicate saves', () => {
  test('handleSave has a synchronous re-entrancy guard (double-click)', () => {
    expect(MODAL_SOURCE).toMatch(/const savingRef = useRef\(false\)/);
    expect(MODAL_SOURCE).toMatch(/if \(savingRef\.current\) return;/);
    expect(MODAL_SOURCE).toMatch(/savingRef\.current = true;/);
    // Guard is released after the save settles (success or error).
    expect(MODAL_SOURCE).toMatch(/savingRef\.current = false;\s*\n\s*setSaving\(false\);/);
  });

  test('guard resets when the modal re-opens', () => {
    // A stuck guard from a previous session must not block the next save.
    expect(MODAL_SOURCE).toMatch(/savingRef\.current = false;\s*\n\s*saveRequestIdRef\.current =/);
  });

  test('onSaveSuccess receives the saved document', () => {
    expect(MODAL_SOURCE).toMatch(/onSaveSuccess\(savedDoc\)/);
  });
});

describe('OrderForm — adopts the saved document id for later saves', () => {
  test('tracks savedDocId + savedDocStatus state', () => {
    expect(ORDER_FORM_SOURCE).toMatch(/const \[savedDocId, setSavedDocId\] = useState\(null\)/);
    expect(ORDER_FORM_SOURCE).toMatch(/const \[savedDocStatus, setSavedDocStatus\] = useState\(null\)/);
  });

  test('passes editingDocumentId OR the adopted savedDocId to the modal', () => {
    expect(ORDER_FORM_SOURCE).toMatch(/editingDocumentId=\{editingDocumentId \|\| savedDocId\}/);
  });

  test('isDraftOrder reflects the adopted draft status for same-session re-saves', () => {
    expect(ORDER_FORM_SOURCE).toMatch(
      /isDraftOrder=\{editingDocumentId \? editingDocStatus === 'draft' : savedDocStatus === 'draft'\}/,
    );
  });

  test('adopts the id from onSaveSuccess', () => {
    expect(ORDER_FORM_SOURCE).toMatch(/onSaveSuccess=\{async \(savedDoc\) => \{/);
    expect(ORDER_FORM_SOURCE).toMatch(/setSavedDocId\(savedDoc\.id\)/);
    expect(ORDER_FORM_SOURCE).toMatch(/setSavedDocStatus\(savedDoc\.status \|\| 'sent'\)/);
  });

  test('forgets the adopted id when the editing target changes', () => {
    expect(ORDER_FORM_SOURCE).toMatch(/setSavedDocId\(null\)[\s\S]{0,80}\[editingDocumentId\]/);
  });
});
