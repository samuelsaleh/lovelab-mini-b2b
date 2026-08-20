/**
 * Browser autofill suppression for client / contact / address fields.
 *
 * Chrome classifies a group of contact-looking inputs as an address form and
 * then ignores autocomplete="off", filling the agent's OWN saved profile into
 * the client fields. Because ClientGate and the order form both write those
 * values back into the shared `clients` table, one accepted autofill can
 * overwrite a real customer's contact details for every user.
 *
 * Defence is layered: a standard autocomplete token, a `name` the browser
 * cannot map onto a known field type, and the opt-out attributes the common
 * password managers respect.
 */

// Kept as a single constant so we can escalate every field at once. Chrome
// treats 'new-password' as "never address-autofill this", which is the known
// fallback when 'off' is not honoured on an address-shaped form.
export const AUTOFILL_OFF = 'off'

/**
 * Props to spread onto a text input that must never be autofilled.
 * `key` only has to be unique-ish and non-semantic — it must not look like
 * name / email / tel / organization / address, or Chrome re-classifies it.
 */
export function noAutofill(key) {
  return {
    autoComplete: AUTOFILL_OFF,
    name: `ll-${key}`,
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
    'data-1p-ignore': '',
    'data-lpignore': 'true',
    'data-form-type': 'other',
  }
}
