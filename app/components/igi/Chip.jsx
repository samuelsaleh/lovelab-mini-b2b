'use client'

/**
 * A small status marker. Six tones, each with one meaning:
 *   now   — something to do today (go collect, produce more)
 *   watch — getting close to the alert level
 *   fine  — nothing to do
 *   a     — a figure we know is incomplete, or a neutral fact worth noticing
 *   flat  — neutral
 *
 * The colours live in app/certificates/certificates.css so they move with the
 * rest of the application's palette.
 */
export default function Chip({ tone = 'flat', children }) {
  const cls = tone === 'flat' ? 'nomove' : tone
  return <span className={`chip ${cls}`}>{children}</span>
}

/** The tone each alert status is shown in. */
export const SHELF_TONE = { collect: 'now', watch: 'watch', fine: 'fine', unmapped: 'unmapped' }
export const POOL_TONE = { reorder: 'now', watch: 'watch', fine: 'fine', unknown: 'flat' }
