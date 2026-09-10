'use client'

/**
 * The five steps a movement goes through, shown across the top.
 *
 * It is on the screen because two companies share this flow and neither can see
 * the other's half. Knowing which step you are on, and whose turn it is, is most
 * of what either side needs from the page.
 */
const STEPS = [
  { title: 'Choose',          who: 'LoveLab',   lane: '',     note: 'Pick the models and how many you need' },
  { title: 'Send to IGI',     who: 'LoveLab',   lane: '',     note: 'The request lands on the IGI dashboard' },
  { title: 'IGI makes them',  who: 'IGI',       lane: 'igi',  note: 'They record what they actually produced' },
  { title: 'Received',        who: 'LoveLab',   lane: '',     note: 'Certificates back — one button' },
  { title: 'In our stock',    who: 'Automatic', lane: 'auto', note: 'Written into our own software' },
]

export default function Pipeline({ active = 0, title = 'How a collection works' }) {
  return (
    <div data-testid="pipeline">
      <p className="pipe-title">{title}</p>
      <div className="pipe">
        {STEPS.map((step, i) => {
          const done = i < active
          const now = i === active
          return (
            <div
              key={step.title}
              className={`pstep${done ? ' done' : ''}${now ? ' now' : ''}`}
              data-testid={now ? 'pipeline-step-active' : 'pipeline-step'}
            >
              <span className="pn">Step {i + 1}{done ? ' · done' : ''}</span>
              <span className="pt">{step.title}</span>
              <span className={step.lane ? `pw ${step.lane}` : 'pw'}>{step.who}</span>
              <span className="pd">{step.note}</span>
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
