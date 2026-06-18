/**
 * @jest-environment node
 *
 * Source-pin: SaveDocumentModal PDF generation retries on timeout
 *
 * 2026-06 — Sam's father tried to edit a (large) Nicolas order on an older
 * desktop running Chrome and got "Failed to generate PDF". Two bugs:
 *
 *  1. The quality-step-down loop only dropped to a cheaper/faster scale when
 *     the file was too BIG — never when a pass TIMED OUT. So a slow machine
 *     timed out on the first heavy pass (scale 1.6) and failed instantly,
 *     never trying the lighter passes that would have succeeded.
 *  2. The timeout message told the user to "open Chrome or Safari... or save
 *     from a computer" — nonsense advice for someone already on desktop Chrome.
 *
 * This is a static source-pin (matching SaveDocumentModal-auto-create-org)
 * because the full modal needs i18n + Supabase + auth state that isn't worth
 * bootstrapping; the fix lives in a small, literal block of source.
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'SaveDocumentModal.jsx'),
  'utf8',
);

describe('SaveDocumentModal — PDF generation retries on timeout', () => {
  test('defines progressively cheaper fallback profiles down to scale 1.0', () => {
    // The cheapest last-resort pass must exist so slow machines can finish.
    expect(SOURCE).toMatch(/scale:\s*1\.0\b/);
    // And the profiles carry a per-pass timeout, not one shared constant.
    expect(SOURCE).toMatch(/profiles\s*=\s*\[[\s\S]*?timeout:[\s\S]*?\]/);
  });

  test('retries the next profile when a pass times out (does not fail outright)', () => {
    // On a timeout we must `continue` to the next cheaper profile rather than
    // throwing. The guard keys off the TimeoutError flag set by withTimeout.
    expect(SOURCE).toMatch(/if\s*\(\s*passErr\?\.isTimeout\s*\)/);
    expect(SOURCE).toMatch(/isTimeout[\s\S]*?continue;/);
  });

  test('non-timeout errors are NOT silently retried', () => {
    // A tainted-canvas / security error won't be fixed by retrying, so it
    // must rethrow immediately.
    expect(SOURCE).toMatch(/throw\s+passErr;/);
  });

  test('only throws the timeout message after every pass is exhausted', () => {
    expect(SOURCE).toMatch(/if\s*\(\s*!pdfBlob\s*\)\s*\{[\s\S]*?throw new Error\(\s*pdfTimeoutMessage\(\)\s*\)/);
  });

  test('timeout message no longer tells desktop users to "open Chrome or Safari" unconditionally', () => {
    // The Chrome/Safari advice must be gated behind an in-app-webview check,
    // not shown to everyone.
    expect(SOURCE).toMatch(/inAppWebview/);
    expect(SOURCE).toMatch(/function\s+pdfTimeoutMessage\s*\(/);
    // The generic (non-in-app) branch blames the workload/device instead.
    expect(SOURCE).toMatch(/too long to build on this device/i);
  });
});
