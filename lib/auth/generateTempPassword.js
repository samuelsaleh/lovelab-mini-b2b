import { randomInt } from 'crypto';

// Generate a temporary password for a newly invited agent.
//
// Format: `{FirstName}{4-digit number}!` when a name is available
// (e.g. `Michaela4821!`), falling back to `Lovelab-{4-digit number}` when
// it isn't. Designed to be read aloud over the phone if email is slow,
// so we strip diacritics, drop ambiguous characters, and capitalize.
//
// The password is single-use in practice — `has_password_set` stays false
// on the profile, so the agent is forced through /set-password on first
// login. We only need it to be unguessable enough to survive the gap
// between email delivery and first sign-in.
export function generateTempPassword(fullName) {
  const digits = randomInt(1000, 10000);
  const first = sanitizeFirstName(fullName);
  if (first) return `${first}${digits}!`;
  return `Lovelab-${digits}`;
}

function sanitizeFirstName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-zA-Z\s'-]/g, '')
    .trim();
  if (!cleaned) return '';
  const first = cleaned.split(/\s+/)[0];
  const letters = first.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 2) return '';
  return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
}
