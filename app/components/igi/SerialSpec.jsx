'use client'

import { modelSpec } from '@/lib/igi/derive'

/**
 * The two things that identify a certificate, and the rule that they travel
 * together.
 *
 * LGAJ6529 and LGAJ6530 look nearly identical, are printed very small, and
 * somebody is handling three hundred cards at a time. So the carat and shape
 * always accompany the serial. Putting that in one place is what makes the
 * rule hold, rather than hoping every screen remembers it.
 *
 * In a table they are two adjacent columns, because the spec is what somebody
 * actually reads when checking a card against a row — burying it as grey text
 * under the serial made it something you had to hunt for. Elsewhere (the task
 * card at IGI's bench) they stack, and `SerialSpec` renders both.
 */

/** The serial on its own. Monospaced, because near-identical numbers must not blur. */
export function Serial({ model, compact = false }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-num)',
        fontSize: compact ? 11.5 : 12.5,
        fontWeight: 600,
        letterSpacing: '.02em',
        whiteSpace: 'nowrap',
        color: model.serial ? 'var(--ink)' : 'var(--ink-faint)',
      }}
      data-testid="serial"
    >
      {model.serial || 'no serial yet'}
    </span>
  )
}

/**
 * What the piece actually is: stones, carat, shape.
 *
 * Full weight and full colour — this is the line someone checks a physical card
 * against, so it is not decoration.
 */
export function Spec({ model, compact = false }) {
  const spec = modelSpec(model)
  return (
    <span
      style={{
        fontFamily: 'var(--font-num)',
        fontSize: compact ? 11.5 : 12.5,
        color: spec ? 'var(--ink-soft)' : 'var(--ink-faint)',
        whiteSpace: 'nowrap',
      }}
      data-testid="spec"
    >
      {spec || '—'}
    </span>
  )
}

/** Both, stacked. For the places that are not a table row. */
export default function SerialSpec({ model, compact = false }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
      <Serial model={model} compact={compact} />
      <Spec model={model} compact={compact} />
    </span>
  )
}
