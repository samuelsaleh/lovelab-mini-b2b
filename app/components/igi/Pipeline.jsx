'use client'

import { colors } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'

/**
 * The five steps a movement goes through, shown across the top.
 *
 * It is on the screen because two companies share this flow and neither can see
 * the other's half. Knowing which step you are on, and whose turn it is, is most
 * of what either side needs from the page.
 */
const STEPS = [
  { title: 'Choose', who: 'LoveLab', note: 'Pick the models and how many you need' },
  { title: 'Send to IGI', who: 'LoveLab', note: 'The request lands on the IGI dashboard' },
  { title: 'IGI makes them', who: 'IGI', note: 'They record what they actually produced' },
  { title: 'Received', who: 'LoveLab', note: 'Certificates back — one button' },
  { title: 'In our stock', who: 'Automatic', note: 'Written into our own software' },
]

const WHO_COLOUR = {
  LoveLab: colors.inkPlum,
  IGI: '#0E5C87',
  Automatic: colors.textMuted,
}

export default function Pipeline({ active = 0, title = 'How a collection works' }) {
  const { isCompact } = useResponsive()

  return (
    <div style={{ marginBottom: 20 }} data-testid="pipeline">
      <p style={{
        margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: colors.textMuted, fontWeight: 700,
      }}>
        {title}
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isCompact ? '1fr' : 'repeat(5, 1fr)',
        gap: 8,
      }}>
        {STEPS.map((step, i) => {
          const done = i < active
          const now = i === active
          return (
            <div
              key={step.title}
              data-testid={now ? 'pipeline-step-active' : 'pipeline-step'}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: now ? '#fff' : colors.bgOff,
                border: `1px solid ${now ? colors.inkPlum : colors.border}`,
                opacity: done ? 0.65 : 1,
              }}
            >
              <div style={{
                fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: colors.textMuted, fontWeight: 700,
              }}>
                Step {i + 1}{done ? ' · done' : ''}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginTop: 2 }}>
                {step.title}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: WHO_COLOUR[step.who], marginTop: 1 }}>
                {step.who}
              </div>
              <div style={{ fontSize: 11, color: colors.textLight, marginTop: 3, lineHeight: 1.4 }}>
                {step.note}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Which step a movement is currently on. */
export function stepForStatus(status) {
  if (status === 'requested') return 2
  if (status === 'issued') return 3
  if (status === 'closed') return 4
  return 0
}
