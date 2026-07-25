/**
 * @jest-environment node
 *
 * Silke / shared-folder collaborators may email the client on save
 * (July 2026). API must NOT be admin-only; document access is enough.
 * UI shows the email block when the user has edit|manage on a folder.
 */

const fs = require('node:fs');
const path = require('node:path');

describe('client email — shared-folder collaborators (Silke)', () => {
  test('send-email API no longer hard-blocks non-admins', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../documents/send-email/route.js'),
      'utf8',
    );
    expect(src).not.toMatch(/Admin access required/);
    expect(src).not.toMatch(/if\s*\(\s*!isAdmin\s*\)\s*\{[\s\S]*?status:\s*403/);
    // Still requires the caller can read the document.
    expect(src).toMatch(/canRead/);
  });

  test('SaveDocumentModal shows email for edit/manage folder collaborators', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../components/SaveDocumentModal.jsx'),
      'utf8',
    );
    expect(src).toMatch(/canEmailClient/);
    expect(src).toMatch(/permission === 'edit' \|\| e\.permission === 'manage'/);
    expect(src).toMatch(/orderChannel === 'b2b' && canEmailClient/);
    // Old admin-only gate must be gone.
    expect(src).not.toMatch(/orderChannel === 'b2b' && isAdmin && \(/);
  });
});
