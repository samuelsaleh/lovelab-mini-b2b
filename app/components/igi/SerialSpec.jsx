'use client'

import { colors } from '@/lib/styles'
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
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: compact ? 11 : 12,
          fontWeight: 600,
          color: model.serial ? colors.text : colors.textMuted,
          letterSpacing: '0.02em',
        }}
        data-testid="serial"
      >
        {model.serial || 'no serial yet'}
      </span>
      <span style={{ fontSize: compact ? 10 : 11, color: colors.textLight }}>
        {spec || '—'}
      </span>
    </span>
  )
}
