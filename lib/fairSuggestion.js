/**
 * Suggest which fair an order belongs to, based on its date.
 *
 * Pure and side-effect free so it can be unit-tested and reused by the save
 * modal and any re-tagging UI. It only SUGGESTS — the caller decides whether to
 * apply it. Never auto-assigns (per the decision that Bastian tags his own).
 *
 * A fair matches when the order date falls inside its inclusive
 * [start_date, end_date] window. Dates are ISO YYYY-MM-DD strings, which sort
 * lexicographically, so plain string comparison is correct and TZ-safe.
 *
 * @param {string|Date} orderDate  - the order's date (ISO string or Date)
 * @param {Array<{id, name, type, start_date, end_date}>} events
 * @returns {object|null} the matching fair event, or null
 */
export function suggestFairForDate(orderDate, events) {
  if (!orderDate) return null;
  const d = orderDate instanceof Date ? orderDate : new Date(orderDate);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toISOString().slice(0, 10);

  const candidates = (events || []).filter(
    (e) => (e.type || '') === 'fair' && e.start_date && e.end_date,
  );
  // If windows overlap, prefer the shortest (most specific) match.
  const matches = candidates
    .filter((f) => f.start_date <= day && day <= f.end_date)
    .sort((a, b) => (a.end_date <= b.end_date && a.start_date >= b.start_date ? -1 : 1));
  return matches[0] || null;
}
