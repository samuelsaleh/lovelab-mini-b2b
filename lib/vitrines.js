/**
 * Vitrine quantity resolution.
 *
 * Shared by AnalyticsDashboard (the "Vitrines" KPI + Vitrine Summary) and the
 * analytics audit script, so an audit can never disagree with the dashboard it
 * is auditing.
 *
 * A vitrine reaches a document one of two ways:
 *   1. the order form's vitrine toggle -> formState.hasVitrine + vitrineQty
 *   2. free text typed into the remarks field ("2 vitrines", "vitrine x3")
 * The toggle wins when both are present.
 */

export const VITRINE_REGEX = /(\d+)\s*vitrines?|vitrines?\s*[x×]?\s*(\d+)/i;

// Real LoveLab orders are 1-10 vitrines. Anything above this is almost
// certainly a data-entry mistake (typo in vitrineQty, or a price/SKU number
// that happens to sit next to the word "vitrine" in the remarks). We clamp
// the parsed value to 1 so a single bad order can't skew the entire summary.
export const MAX_VITRINE_QTY = 20;

export function parseVitrineFromRemarks(remarks) {
  if (!remarks) return null;
  const m = String(remarks).match(VITRINE_REGEX);
  if (!m) return String(remarks).toLowerCase().includes('vitrine') ? 1 : null;
  const parsed = parseInt(m[1] || m[2], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Resolve a document's vitrine quantity along with WHERE the number came from
 * and whether it had to be clamped. The audit reports on the provenance; the
 * dashboard only needs `qty`.
 *
 * @param {object} doc - a document row (needs metadata.formState)
 * @returns {{ qty: number|null, source: 'toggle'|'remarks'|null, raw: number|null, clamped: boolean }}
 */
export function resolveVitrineDetail(doc) {
  const none = { qty: null, source: null, raw: null, clamped: false };
  const fs = doc?.metadata?.formState;
  if (!fs) return none;

  const { hasVitrine, vitrineQty, remarks } = fs;
  const toggleQty = hasVitrine ? (Number(vitrineQty) || 1) : null;
  const remarksQty = parseVitrineFromRemarks(remarks);

  const raw = toggleQty !== null ? toggleQty : remarksQty;
  const source = toggleQty !== null ? 'toggle' : (remarksQty !== null ? 'remarks' : null);
  if (raw === null || source === null) return none;
  if (raw <= 0) return none;

  if (raw > MAX_VITRINE_QTY) return { qty: 1, source, raw, clamped: true };
  return { qty: raw, source, raw, clamped: false };
}

/**
 * Dashboard-facing helper: just the quantity. Logs a warning when an
 * implausible quantity is clamped, so a bad order is visible in the console
 * instead of silently distorting the KPI.
 */
export function resolveVitrineQty(doc) {
  const detail = resolveVitrineDetail(doc);
  if (detail.clamped && typeof console !== 'undefined' && console.warn) {
    const who = doc?.client_company || doc?.client_name || 'unknown';
    console.warn(
      `[Analytics] Capping implausible vitrine quantity ${detail.raw} -> 1 (source: ${detail.source}/${who})`,
    );
  }
  return detail.qty;
}

export default resolveVitrineQty;
