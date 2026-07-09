/**
 * Calendar quarter helpers for SYNALIA quarterly CA reports.
 */

import { isSynaliaJewelerGroup, jewelerGroupFromLegacy } from './jewelerGroup.js';

const QUARTER_MONTHS_FR = {
  1: 'janv.–mars',
  2: 'avr.–juin',
  3: 'juil.–sept.',
  4: 'oct.–déc.',
};

/**
 * @param {number} year
 * @param {number} quarter 1–4
 * @returns {{ year: number, quarter: number, start: Date, end: Date, key: string, label: string, labelLong: string }}
 */
export function getQuarterBounds(year, quarter) {
  const y = Number(year);
  const q = Number(quarter);
  if (!Number.isFinite(y) || q < 1 || q > 4) {
    throw new Error('Invalid year or quarter');
  }
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(y, startMonth, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, startMonth + 3, 0, 23, 59, 59, 999));
  const key = `${y}-T${q}`;
  const label = `T${q} ${y}`;
  const labelLong = `${q}${q === 1 ? 'er' : 'ème'} trimestre ${y} (${QUARTER_MONTHS_FR[q]} ${y})`;
  return { year: y, quarter: q, start, end, key, label, labelLong };
}

/**
 * Current calendar quarter containing refDate.
 */
export function getCurrentQuarter(refDate = new Date()) {
  const month = refDate.getUTCMonth();
  const year = refDate.getUTCFullYear();
  const quarter = Math.floor(month / 3) + 1;
  return getQuarterBounds(year, quarter);
}

/**
 * Previous completed calendar quarter relative to refDate.
 */
export function getPreviousQuarter(refDate = new Date()) {
  const month = refDate.getUTCMonth();
  const year = refDate.getUTCFullYear();
  if (month <= 2) return getQuarterBounds(year - 1, 4);
  if (month <= 5) return getQuarterBounds(year, 1);
  if (month <= 8) return getQuarterBounds(year, 2);
  return getQuarterBounds(year, 3);
}

/**
 * Quarter options for the SYNALIA export dropdown: current quarter first,
 * then forward in time (default 8 quarters ≈ 2 years, e.g. T2 2026 → T1 2028).
 */
export function listSynaliaQuarterOptions(refDate = new Date(), forwardCount = 8) {
  const current = getCurrentQuarter(refDate);
  let year = current.year;
  let quarter = current.quarter;
  const items = [];
  for (let i = 0; i < forwardCount; i += 1) {
    const bounds = getQuarterBounds(year, quarter);
    items.push({
      year: bounds.year,
      quarter: bounds.quarter,
      label: bounds.label,
      labelLong: bounds.labelLong,
      isCurrent: i === 0,
    });
    quarter += 1;
    if (quarter > 4) {
      quarter = 1;
      year += 1;
    }
  }
  return items;
}

/** @deprecated Use listSynaliaQuarterOptions — kept for tests */
export function listRecentQuarters(count = 8, refDate = new Date()) {
  return listSynaliaQuarterOptions(refDate, count);
}

/**
 * Parse the order date from document metadata (form date) or created_at.
 * @param {{ created_at?: string, metadata?: object }} doc
 * @returns {Date}
 */
export function parseOrderDate(doc) {
  const raw = doc?.metadata?.formState?.date || doc?.metadata?.date;
  if (raw) {
    const parsed = Date.parse(String(raw));
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  return new Date(doc?.created_at || 0);
}

export function isSynaliaOrder(doc) {
  return isSynaliaJewelerGroup(jewelerGroupFromLegacy(doc?.metadata));
}

export function filterSynaliaOrdersForQuarter(docs, year, quarter) {
  const { start, end } = getQuarterBounds(year, quarter);
  return (docs || []).filter((doc) => {
    if (!isSynaliaOrder(doc)) return false;
    const d = parseOrderDate(doc);
    const t = d.getTime();
    return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime();
  });
}
