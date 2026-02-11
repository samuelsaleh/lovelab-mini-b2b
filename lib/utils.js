/**
 * Format a number as EUR currency with European-style formatting.
 * Uses 2 decimal places for fractional amounts, 0 for whole numbers.
 */
export const fmt = (n) => {
  const num = Number(n)
  if (isNaN(num)) return '€0'
  // Use 2 decimals if fractional, 0 if whole number
  const decimals = num % 1 !== 0 ? 2 : 0
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Check if a hex color is light (for text contrast).
 * Handles 7-char (#RRGGBB) and 4-char (#RGB) hex codes.
 */
export const isLight = (hex) => {
  if (!hex || typeof hex !== 'string') return false
  let h = hex.startsWith('#') ? hex.slice(1) : hex
  // Expand short hex (#RGB -> #RRGGBB)
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  if (h.length !== 6) return false
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7
}

/**
 * Today's date formatted in European style.
 * Uses CET timezone for consistency at trade fairs.
 */
export const today = () =>
  new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Brussels',
  })
