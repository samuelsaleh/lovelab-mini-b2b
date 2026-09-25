import { buildReportData } from '../buildReportData.js'
import { checkReport } from '../checks.js'
import { renderAlert, sendReportAlert } from '../alerts.js'

const order = (id, date, amount, extra = {}) => ({ id, date, channel: 'B2B', amount, eventId: null, agentId: null, rawChannel: 'b2b', lineTotal: 0, ...extra })
const model = (over = {}) => ({ source: 'supabase', amountBasis: 'net_ex_vat', dataThrough: '2026-09-25', orders: [], events: [], agents: [], commissions: [], payments: [], ...over })
const run = (m, month = '2026-09') => checkReport(buildReportData(m, month), m)

describe('checkReport', () => {
  it('passes a clean month', () => {
    expect(run(model({ orders: [order('a', '2026-09-02', 500, { lineTotal: 500 })] }))).toEqual({ errors: [], warnings: [] })
  })

  it('catches a report whose totals contradict each other', () => {
    const m = model({ orders: [order('a', '2026-09-02', 500)] })
    const report = buildReportData(m, '2026-09')
    report.kpis.b2b = 400 // corrupted
    expect(checkReport(report, m).errors[0]).toMatch(/does not equal net sales/)
  })

  it('flags €0 orders and totals entered in cents (the 16/09 B2C case)', () => {
    const w = run(model({ orders: [order('a', '2026-09-16', 0.75, { lineTotal: 75 }), order('b', '2026-09-07', 0, { lineTotal: 330 }), order('c', '2026-09-03', 900, { lineTotal: 950 })] })).warnings
    expect(w.some((x) => /1 order\(s\) recorded at €0/.test(x))).toBe(true)
    expect(w.some((x) => /entered in cents instead of euros: €0.75 recorded vs €75 of lines/.test(x))).toBe(true)
    expect(w.join(' ')).not.toMatch(/€900/) // a normal discount is not flagged
  })

  it('flags typed dates it could not read', () => {
    const w = run(model({ orders: [order('a', '2026-09-02', 500, { dateSource: 'typed_unreadable' })] })).warnings
    expect(w[0]).toMatch(/typed date the report could not read/)
  })

  it('flags a new order channel the report does not know yet', () => {
    const w = run(model({ orders: [order('a', '2026-09-02', 500, { rawChannel: 'marketplace' })] })).warnings
    expect(w[0]).toMatch(/New order channel\(s\).*marketplace.*counted as B2B/)
  })

  it('flags orders pointing to deleted fairs, unknown agents, future dates and a month that suddenly has no sales', () => {
    const w = run(model({ orders: [order('a', '2026-09-02', 500, { eventId: 'gone', agentId: 'ghost' }), order('b', '2026-09-30', 10, { lineTotal: 10 })] })).warnings.join(' | ')
    expect(w).toMatch(/fair or folder that no longer exists/)
    expect(w).toMatch(/no profile/)
    expect(w).toMatch(/dated after today \(2026-09-30\)/)
    const empty = run(model({ orders: [order('a', '2026-08-02', 500)] })).warnings
    expect(empty[0]).toMatch(/No sales at all this month, though August 2026 had 1/)
  })
})

describe('alerts', () => {
  it('renders an error alert that says what was and was not delivered, escaping the problem text', () => {
    const { subject, html } = renderAlert({ month: '2026-09', level: 'error', problems: ['PDF not uploaded: <quota>'], delivered: { drive: false, email: true } })
    expect(subject).toMatch(/problem — check now/)
    expect(html).toContain('NOT uploaded')
    expect(html).toContain('&lt;quota&gt;')
  })

  it('sends only to the alert address, and not at all when there is nothing to report or no address', async () => {
    const send = jest.fn().mockResolvedValue({ sent: true })
    await sendReportAlert({ month: '2026-09', level: 'warning', problems: ['x'], send, recipients: ['rafi@example.com'] })
    expect(send.mock.calls[0][0].to).toEqual(['rafi@example.com'])
    expect(await sendReportAlert({ month: '2026-09', level: 'warning', problems: [], send, recipients: ['rafi@example.com'] })).toMatchObject({ skipped: true })
    expect(await sendReportAlert({ month: '2026-09', level: 'error', problems: ['x'], send, recipients: [] })).toMatchObject({ skipped: true, reason: 'no_alert_recipient' })
    expect(send).toHaveBeenCalledTimes(1)
  })
})
