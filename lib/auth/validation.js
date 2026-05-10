/**
 * Canonical email validation helpers.
 *
 * Single source of truth used by every auth-related route:
 *   - app/api/agents/route.js       (admin creates an agent)
 *   - app/api/signup-request/route.js (anyone requests access)
 *   - app/api/magic-link/route.js   (anyone requests a sign-in link)
 *   - app/api/forgot-password/route.js (anyone requests a password reset)
 *   - lib/organizations/invitations.js (re-exports for backward compat)
 *
 * Keeping the regex in one place means tightening it (or relaxing it for
 * a customer hitting an edge case) is a one-line change instead of a
 * grep-and-pray exercise.
 */

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}
