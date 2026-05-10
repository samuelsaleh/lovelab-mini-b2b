import crypto from 'node:crypto';

// Email validation helpers live in lib/auth/validation.js as the single
// source of truth. Re-exported here for backward compatibility with
// existing callers that still import from this module.
export { normalizeEmail, isValidEmail } from '../auth/validation.js';

export function generateInvitationToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function getDefaultExpiryIso(days = 14) {
  const now = Date.now();
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}
