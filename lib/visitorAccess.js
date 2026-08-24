/**
 * Demo / visitor accounts can open every admin screen but must not show
 * LoveLab's live business numbers. Catalog prices in the builder stay
 * visible so a client walkthrough still works. Analytics hides euros and
 * counts (orders, pieces, vitrines, clients).
 */

export const VISITOR_EMAILS = ['ssaleh@traxb2b.com']

export const HIDDEN_REVENUE_LABEL = '—'

export function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase()
}

export function isVisitorEmail(email) {
  return VISITOR_EMAILS.includes(normalizeEmail(email))
}

export function hidesRevenue(profileOrEmail) {
  if (!profileOrEmail) return false
  if (typeof profileOrEmail === 'string') return isVisitorEmail(profileOrEmail)
  return isVisitorEmail(profileOrEmail.email)
}
