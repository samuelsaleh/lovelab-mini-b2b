'use client'

import { colors } from '@/lib/styles'

/**
 * A small status marker. Six tones, each with one meaning:
 *   now   — something to do today (go collect, produce more)
 *   watch — getting close to the alert level
 *   fine  — nothing to do
 *   gap   — a figure we know is incomplete
 *   flat  — neutral
 */
const TONES = {
  now:   { bg: '#fef2f2', fg: '#b91c1c', br: '#fecaca' },
  watch: { bg: '#fffbeb', fg: '#b45309', br: '#fde68a' },
  fine:  { bg: '#f0fdf4', fg: '#15803d', br: '#bbf7d0' },
  gap:   { bg: '#f5f3ff', fg: '#6d28d9', br: '#ddd6fe' },
  flat:  { bg: '#f8f8f8', fg: colors.textLight, br: colors.border },
}

export default function Chip({ tone = 'flat', children }) {
  const t = TONES[tone] || TONES.flat
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.br}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

/** The tone each alert status is shown in. */
export const SHELF_TONE = { collect: 'now', watch: 'watch', fine: 'fine', unmapped: 'flat' }
export const POOL_TONE = { reorder: 'now', watch: 'watch', fine: 'fine', unknown: 'flat' }
