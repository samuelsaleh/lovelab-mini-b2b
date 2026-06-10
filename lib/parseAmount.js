/**
 * parseAmount — locale-tolerant money parser for free-text amount inputs.
 *
 * Native <input type="number"> only accepts the decimal separator of the
 * browser/OS locale. On a French/Belgian setup mom types "146,55" with a
 * comma and the field silently rejects the cents ("ik kon die 0,55 niet
 * doen"). To avoid that we use <input type="text" inputMode="decimal"> and
 * normalise the string here, accepting both comma and dot decimals plus
 * thousands separators (spaces, NBSP, and grouping dots/commas).
 *
 * Examples:
 *   "146,55"     -> 146.55
 *   "146.55"     -> 146.55
 *   "1.469,55"   -> 1469.55   (dot thousands, comma decimal — fr/de style)
 *   "1,469.55"   -> 1469.55   (comma thousands, dot decimal — en style)
 *   "1 469,55"   -> 1469.55   (space thousands)
 *   "€ 146,55"   -> 146.55
 *   ""           -> NaN
 *
 * Returns a finite Number, or NaN when the input can't be parsed.
 */
export function parseAmount(raw) {
  if (raw == null) return NaN;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;

  // Strip everything that isn't a digit, separator, or sign (currency symbols,
  // letters, etc.) and collapse spaces used as thousands separators.
  let s = String(raw)
    .trim()
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/[^0-9.,-]/g, '');

  if (!s) return NaN;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // Whichever separator appears last is the decimal one; the other groups.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Single comma -> decimal; multiple commas -> thousands grouping.
    s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot) {
    // Multiple dots can only be thousands grouping (e.g. "1.469.000").
    if (s.split('.').length > 2) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export default parseAmount;
