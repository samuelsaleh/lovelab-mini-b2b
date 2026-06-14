/**
 * Race a promise against a hard timeout.
 *
 * Why this exists: the order-save flow awaits `generatePDF` (html2canvas) and
 * the final save fetch with no upper bound. On some mobile browsers
 * html2canvas can stall indefinitely (low memory, backgrounded tab, in-app
 * webviews), which left the Save modal spinning forever with no error — the
 * agent "Bastian" hit exactly this (0 orders ever saved, no server error, no
 * PDF ever uploaded). Wrapping the long awaits in `withTimeout` guarantees the
 * UI always recovers and shows an actionable message instead of hanging.
 *
 * Note: this does NOT cancel the underlying work (you can't abort an
 * in-flight html2canvas render); it just stops the caller from awaiting it
 * forever. For fetch, pair this with an AbortController to also cancel the
 * request.
 *
 * @template T
 * @param {Promise<T>} promise   The work to bound.
 * @param {number} ms            Timeout in milliseconds (must be > 0).
 * @param {string} [message]     Error message thrown on timeout.
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms, message) {
  if (!Number.isFinite(ms) || ms <= 0) {
    // No valid timeout requested — just pass the promise through unchanged.
    return Promise.resolve(promise);
  }

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(message || `Operation timed out after ${ms}ms`);
      err.name = 'TimeoutError';
      err.isTimeout = true;
      reject(err);
    }, ms);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    clearTimeout(timer);
  });
}
