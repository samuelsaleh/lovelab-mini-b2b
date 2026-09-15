// Production sender is Dionne's verified LoveLab office address. Falls back
// here only when the SENDER_EMAIL env var is unset — every outbound
// transactional email is from "LoveLab <dionne@>" so client replies funnel
// directly into the team mailbox someone reads, not Alberto's personal inbox.
const DEFAULT_SENDER = 'dionne@love-lab.com';
const DEFAULT_NOTIFICATION_RECIPIENTS = ['alberto@love-lab.com', 'dionne@love-lab.com', 'elie@love-lab.com'];
// Default admin recipient (gets approval requests + outbound copies) when
// ADMIN_NOTIFICATION_EMAIL is unset. Alberto's personal Gmail is the safe fallback
// because it's the inbox he actually monitors.
const DEFAULT_ADMIN_RECIPIENT = 'albertosaleh@gmail.com';

// Sam asked not to receive copies of client order emails. Signup requests and
// backup alerts still use ADMIN_NOTIFICATION_EMAIL as-is.
export const ORDER_COPY_EXCLUDED_EMAILS = [
  'samuelsaleh@gmail.com',
  'sameworldsalad@gmail.com',
];

export function isExcludedFromOrderCopies(email) {
  return ORDER_COPY_EXCLUDED_EMAILS.includes(String(email || '').trim().toLowerCase());
}

export function getSenderEmail() {
  return process.env.SENDER_EMAIL || DEFAULT_SENDER;
}

// Friendly-from defaults to bare "LoveLab" — agents and clients recognize the
// brand, "B2B" is internal jargon they don't need to see in their inbox.
export function getSenderFrom(name = 'LoveLab') {
  return `${name} <${getSenderEmail()}>`;
}

export function getOrderNotificationRecipients() {
  const envVal = process.env.ORDER_NOTIFICATION_EMAILS;
  if (envVal) return envVal.split(',').map(e => e.trim()).filter(Boolean);
  return DEFAULT_NOTIFICATION_RECIPIENTS;
}

// Sam, 15 Sep 2026: Debbie and Dahlia receive every order notice, whatever
// the channel. (The 14 Sep version added Debbie for B2C only; every order
// since was B2B, so she heard nothing.) These are APPENDED to whatever
// ORDER_NOTIFICATION_EMAILS says, so a server setting cannot leave them out.
// Override with EXTRA_ORDER_NOTIFICATION_EMAILS (comma-separated); an empty
// value switches the extra off.
const ALWAYS_ORDER_NOTIFICATION_EXTRA = ['debbie@love-lab.com', 'dahlia@love-lab.com'];

export function getExtraOrderNotificationRecipients() {
  const envVal = process.env.EXTRA_ORDER_NOTIFICATION_EMAILS;
  if (envVal !== undefined) return envVal.split(',').map(e => e.trim()).filter(Boolean);
  return ALWAYS_ORDER_NOTIFICATION_EXTRA;
}

/** The office addresses an order notice goes to: the base list plus the always-added extra. */
export function getOrderNotificationRecipientsFor(_document) {
  const base = getOrderNotificationRecipients();
  const seen = new Set(base.map(e => e.toLowerCase()));
  const extra = getExtraOrderNotificationRecipients().filter(e => {
    const k = e.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [...base, ...extra];
}

// Parse the comma-separated ADMIN_NOTIFICATION_EMAIL env var into a normalised
// { to, cc, all } object. The first address is the primary recipient (the one
// you'd put in the `to:` field), the rest are CC'd. Whitespace and case are
// normalised; duplicates are dropped. Falls back to DEFAULT_ADMIN_RECIPIENT
// when the env var is unset OR empty after trimming.
//
// This is the single source of truth for "who receives admin emails" — every
// route that previously hardcoded an admin address (signup approval, document
// send-email CC, resources send-email CC, backup failure alerts) should call
// this helper instead so a single env-var change propagates everywhere.
export function getAdminNotificationRecipients() {
  const raw = (process.env.ADMIN_NOTIFICATION_EMAIL || '').trim();
  const parsed = Array.from(new Set(
    raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
  ));
  const all = parsed.length > 0 ? parsed : [DEFAULT_ADMIN_RECIPIENT];
  const [to, ...cc] = all;
  return { to, cc, all };
}
