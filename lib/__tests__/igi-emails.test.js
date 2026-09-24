/**
 * The three movement emails (Sam, 18 Sept 2026).
 */
import { igiRequestEmail, lovelabIssuedEmail, igiShortReturnEmail } from '../igi/emails'

const VISIT = { id: 'v1', visit_no: 33, visit_date: '2026-09-18', status: 'requested', note: null }
const LINES = [
  { model_id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round', qty_requested: 100, qty_issued: null, qty_received: null, held: 900 },
  { model_id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine', stones: '1', carat: 0.5, shape: 'Heart', qty_requested: 500, qty_issued: null, qty_received: null, held: 41 },
]

describe('igiRequestEmail — to IGI when LoveLab ask', () => {
  it('names the movement and the total, lists every line with what IGI hold, and links their To do', () => {
    const { subject, html } = igiRequestEmail({ visit: VISIT, lines: LINES, siteUrl: 'https://app.test' })
    expect(subject).toBe('LoveLab ask for 600 certificates — V-033')
    expect(html).toContain('Cuty-Cubix')
    expect(html).toContain('Shapy Shine')
    expect(html).toContain('https://app.test/igi')
    expect(html).toContain('Open your To do')
    expect(html).toContain('<!DOCTYPE html')
  })

  it('puts the serial big and our name small — IGI work by serial (Sam, 24 Sept 2026)', () => {
    const { html } = igiRequestEmail({ visit: VISIT, lines: LINES })
    expect(html).toMatch(/<th[^>]*>Serial<\/th>/)
    expect(html).toMatch(/<b style="font-family:'SF Mono'[^>]*>LGAJ6552<\/b><br><span[^>]*>Shapy Shine · 1 st · 0,50 ct · Heart<\/span>/)
  })

  it('says which lines ask for more than IGI hold', () => {
    const { html } = igiRequestEmail({ visit: VISIT, lines: LINES })
    expect(html).toMatch(/Short by/)
    expect(html).toMatch(/459/)
    expect(html).toMatch(/more than you hold/)
  })

  it('leaves the short column out when nothing is short', () => {
    const { html } = igiRequestEmail({ visit: VISIT, lines: [LINES[0]] })
    expect(html).not.toMatch(/Short by/)
  })

  it('carries the note, escaped', () => {
    const { html } = igiRequestEmail({ visit: { ...VISIT, note: 'Before Friday <please>' }, lines: LINES })
    expect(html).toContain('Before Friday &lt;please&gt;')
  })

  it('never mentions the shelf', () => {
    const { html, subject } = igiRequestEmail({ visit: VISIT, lines: LINES })
    expect(`${subject} ${html}`.toLowerCase()).not.toContain('shelf')
  })
})

describe('lovelabIssuedEmail — to LoveLab when IGI made it', () => {
  const made = [
    { ...LINES[0], qty_issued: 100 },
    { ...LINES[1], qty_issued: 41 },
  ]
  it('says how many were made and how many fewer than asked', () => {
    const { subject, html } = lovelabIssuedEmail({ visit: { ...VISIT, status: 'issued' }, lines: made, siteUrl: 'https://app.test' })
    expect(subject).toBe('IGI made V-033: 141 certificates — 1 model fewer than asked')
    expect(html).toMatch(/459 certificates fewer than asked/)
    expect(html).toContain('https://app.test/certificates/visits/v1')
    expect(html).toMatch(/Dashboard will ask again/)
  })
  it('keeps the subject plain when everything was made', () => {
    const { subject, html } = lovelabIssuedEmail({ visit: VISIT, lines: [made[0]] })
    expect(subject).toBe('IGI made V-033: 100 certificates')
    expect(html).toMatch(/Everything asked for was made/)
  })
})

describe('igiShortReturnEmail — to IGI when fewer came back than they made', () => {
  const back = [
    { ...LINES[0], qty_issued: 100, qty_received: 98 },
    { ...LINES[1], qty_issued: 41, qty_received: 41 },
  ]
  it('lists only the short lines with made, counted and missing', () => {
    const { subject, html } = igiShortReturnEmail({ visit: VISIT, lines: back, siteUrl: 'https://app.test' })
    expect(subject).toBe('V-033 came back short: 2 certificates missing')
    expect(html).toContain('Cuty-Cubix')
    expect(html).not.toContain('Shapy Shine')
    expect(html).toMatch(/<b style="font-family:'SF Mono'[^>]*>LGAJ6530<\/b>/)
    expect(html).toMatch(/LoveLab counted/)
    expect(html).toContain('https://app.test/igi/history')
  })
  it('never mentions the shelf', () => {
    const { html, subject } = igiShortReturnEmail({ visit: VISIT, lines: back })
    expect(`${subject} ${html}`.toLowerCase()).not.toContain('shelf')
  })
})
