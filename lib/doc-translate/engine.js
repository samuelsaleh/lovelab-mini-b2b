// Extract → translate → render pipeline. Not connected yet: it depends on the
// rendering engine decision (PyMuPDF, AGPL, Python runtime on Vercel).
export async function translateDocument() {
  return { ok: false, status: 501, error: 'Translation engine is not connected yet' }
}
