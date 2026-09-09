/**
 * Resend webhook signature verification — no svix dependency.
 *
 * Resend signs webhooks the Svix way: three headers (svix-id, svix-timestamp,
 * svix-signature), a secret of the form `whsec_<base64>`, and an HMAC-SHA256
 * over `${id}.${timestamp}.${rawBody}` with the base64-decoded secret. The
 * signature header may carry several space-separated `v1,<base64>` entries;
 * any one matching is enough. The raw body must be used exactly as received.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export function computeResendSignature(secret, id, timestamp, rawBody) {
  const base64Part = String(secret || '').startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const key = Buffer.from(base64Part, 'base64');
  return createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifyResendSignature({
  secret,
  id,
  timestamp,
  signatureHeader,
  rawBody,
  now = Date.now(),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
}) {
  if (!secret) return { ok: false, reason: 'no_secret' };
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing_headers' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' };
  const skew = Math.abs(now / 1000 - ts);
  if (skew > toleranceSeconds) return { ok: false, reason: 'timestamp_out_of_tolerance' };

  const expected = computeResendSignature(secret, id, timestamp, rawBody);
  const candidates = String(signatureHeader)
    .split(' ')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.includes(',') ? entry.slice(entry.indexOf(',') + 1) : entry));

  return candidates.some((sig) => safeEqual(sig, expected))
    ? { ok: true }
    : { ok: false, reason: 'signature_mismatch' };
}
