'use client'

import { modelSpec } from '@/lib/igi/derive'

/**
 * The only way a certificate serial is rendered anywhere in this module.
 *
 * LGAJ6529 and LGAJ6530 look nearly identical, are printed very small, and
 * somebody is handling three hundred cards at a time. So the carat and shape
 * always travel with the serial — putting that in one component is what makes
 * the rule hold, rather than hoping every screen remembers it.
 *
 * A model still waiting for a serial from IGI shows that plainly instead of an
 * empty space.
 */
export default function SerialSpec({ model, compact = false }) {
  const spec = modelSpec(model)

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
      <span
        style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: compact ? 11.5 : 12.5,
          fontWeight: 600,
          letterSpacing: '.02em',
          color: model.serial ? 'var(--ink)' : 'var(--ink-faint)',
        }}
        data-testid="serial"
      >
        {model.serial || 'no serial yet'}
      </span>
      <span className="spec" style={{ fontSize: compact ? 10.5 : 11.5 }}>
        {spec || '—'}
      </span>
    </span>
  )
}
