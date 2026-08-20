/**
 * Guard for the contact columns of the shared `clients` directory.
 *
 * `public.clients` is shared by every agent, so an update that silently
 * replaces `name` / `email` / `phone` destroys data for everyone. That happens
 * in two ways: a browser autofills the agent's own details into the client
 * fields, or an order form saves a half-filled header. Both used to win,
 * because the update payload was written unconditionally.
 *
 * Rules applied here:
 *  - an empty incoming value never clears a stored value
 *  - an unchanged value (ignoring case and surrounding whitespace) is a no-op
 *  - a genuinely different value only lands with an explicit confirmation,
 *    otherwise the stored value survives and a warning is reported back
 */

export const CONTACT_FIELDS = ['name', 'email', 'phone']

const clean = (value) => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim())
const sameValue = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase()

/**
 * @param {object|null} existing  current DB row (null for a new client)
 * @param {object} incoming       request body
 * @param {{ confirmOverwrite?: boolean }} options
 * @returns {{ fields: object, warnings: Array<{field: string, stored: string, incoming: string}> }}
 *          `fields` only contains the columns that should actually be written.
 */
export function mergeClientContact(existing, incoming, { confirmOverwrite = false } = {}) {
  const fields = {}
  const warnings = []

  for (const field of CONTACT_FIELDS) {
    const next = clean(incoming?.[field])
    const stored = clean(existing?.[field])

    if (!existing) {
      // New client: nothing to protect, take whatever was entered.
      fields[field] = next || null
      continue
    }

    if (!next) {
      // Never let a blank field wipe a stored contact detail.
      continue
    }

    if (!stored) {
      // Filling a gap is always safe.
      fields[field] = next
      continue
    }

    if (sameValue(next, stored)) continue

    if (confirmOverwrite) {
      fields[field] = next
    } else {
      warnings.push({ field, stored, incoming: next })
    }
  }

  return { fields, warnings }
}
