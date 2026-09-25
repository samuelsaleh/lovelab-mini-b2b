import { buildReportData } from '../buildReportData.js'
import { loadSample } from '../dataSources/sample.js'
import { renderMonthlyEmail } from '../renderEmail.js'
import { renderPdfHtml } from '../renderPdfHtml.js'
import { fitLabel, horizontalBars, niceScale, splitBars, stackedColumns } from '../svgCharts.js'

const real = (over = {}) =>
  buildReportData(
    {
      source: 'supabase',
      amountBasis: 'net_ex_vat',
      dataThrough: '2026-09-24',
      orders: [{ id: 'o', date: '2026-08-05', channel: 'B2B', amount: 82760, eventId: null, agentId: 'a' }],
      events: [],
      agents: [{ id: 'a', name: 'Ann <script>' }],
      commissions: [],
      payments: [],
      ...over,
    },
    '2026-08',
  )

describe('sample data', () => {
  it('is deterministic', () => {
    expect(loadSample()).toEqual(loadSample())
  })
})

describe('renderMonthlyEmail', () => {
  it('shows the headline figures and escapes names', () => {
    const { subject, html, text } = renderMonthlyEmail(real())
    expect(subject).toBe('LoveLab — August 2026 sales')
    expect(html).toContain('€82,760')
    expect(html).toContain('Ann &lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('No fairs this month')
    expect(text).toMatch(/Net sales: €82,760/)
  })

  it('stamps sample data in the subject and the body, and only then', () => {
    const sample = renderMonthlyEmail(buildReportData(loadSample(), '2026-08'))
    expect(sample.subject).toMatch(/^\[SAMPLE\]/)
    expect(sample.html).toContain('SAMPLE DATA — NOT REAL')
    expect(renderMonthlyEmail(real()).html).not.toContain('SAMPLE DATA')
  })
})

describe('renderPdfHtml', () => {
  it('is one phone-width page with every section', () => {
    const html = renderPdfHtml(buildReportData(loadSample(), '2026-08'))
    expect(html).toMatch(/\.page \{ width: 120mm/)
    for (const s of ['Sales by month', 'Sales by agent', 'B2B vs B2C', 'Agents · August 2026', 'Fairs · August 2026']) expect(html).toContain(s)
    expect(html).toContain('SAMPLE DATA — NOT REAL')
    expect(html.match(/<svg /g)).toHaveLength(3)
  })

  it('carries no sample stamp for real data and says when there were no fairs', () => {
    const html = renderPdfHtml(real())
    expect(html).not.toContain('SAMPLE DATA')
    expect(html).toContain('No fairs this month.')
  })
})

describe('svgCharts', () => {
  it('picks clean axis steps', () => {
    expect(niceScale(126000)).toEqual({ max: 150000, step: 50000 })
    expect(niceScale(0)).toEqual({ max: 1, step: 1 })
  })

  it('draws one column per month, stacked where both channels sold', () => {
    const svg = stackedColumns([
      { month: '2026-07', label: 'Jul', year: '2026', b2b: 100, b2c: 20, total: 120, isReportMonth: false },
      { month: '2026-08', label: 'Aug', year: '2026', b2b: 50, b2c: 0, total: 50, isReportMonth: true },
    ])
    expect(svg.match(/fill="#B08028"/g)).toHaveLength(1)
    expect(svg).toContain('Aug')
  })

  it('draws a bar per agent, and a message when there are none', () => {
    expect(horizontalBars([{ name: 'A', value: 1 }, { name: 'B', value: 2 }]).match(/<path /g)).toHaveLength(2)
    expect(horizontalBars([])).toContain('No agent sales this month')
  })

  it('shortens a long agent name to fit its gutter instead of running off the edge', () => {
    expect(fitLabel('Silke Holdinghausen', 102, 7.5)).toBe('Silke Holdinghausen')
    const cut = fitLabel('NICOLAS WHOLESALE FRANCE', 102, 7.5)
    expect(cut.startsWith('NICOLAS')).toBe(true)
    expect(cut.endsWith('…')).toBe(true)
  })

  it('draws a grey bar for a split with no sales', () => {
    expect(splitBars([{ label: 'Aug', b2b: 0, b2c: 0 }])).toContain('No sales')
  })
})

describe('commission is labelled as a cost to LoveLab', () => {
  const withCommission = () =>
    buildReportData(
      {
        source: 'supabase',
        amountBasis: 'net_ex_vat',
        dataThrough: '2026-09-24',
        orders: [{ id: 'o', date: '2026-08-05', channel: 'B2B', amount: 1000, eventId: 'f', agentId: 'a' }],
        events: [{ id: 'f', name: 'INOVA', kind: 'fair' }],
        agents: [{ id: 'a', name: 'Ann' }],
        commissions: [{ id: 'c', agentId: 'a', orderId: 'o', date: '2026-08-05', amount: 150 }],
        payments: [],
      },
      '2026-08',
    )

  it('shows commission with a minus sign and says who pays whom, in the PDF', () => {
    const html = renderPdfHtml(withCommission())
    expect(html).toContain('−€150')
    expect(html).toContain('Owed to<br>agent')
    expect(html).toContain('LoveLab keeps')
    expect(html).toContain('Commission owed to agents')
    expect(html).not.toMatch(/Commission earned|Net of commission|Paid out</)
  })

  it('does the same in the email', () => {
    const { html, text } = renderMonthlyEmail(withCommission())
    expect(html).toContain('−€150')
    expect(html).toContain('LoveLab owes its agents')
    expect(text).toMatch(/cost to LoveLab/)
    expect(html).not.toMatch(/net of commission|earned on/)
  })
})

describe('fairs are shown separately, never added together', () => {
  const twoFairs = () =>
    buildReportData(
      {
        source: 'supabase', amountBasis: 'net_ex_vat', dataThrough: '2026-09-24',
        orders: [
          { id: 'a', date: '2026-07-26', channel: 'B2B', amount: 28000, eventId: 'n', agentId: null },
          { id: 'b', date: '2026-08-02', channel: 'B2B', amount: 4404, eventId: 'n', agentId: null },
          { id: 'c', date: '2026-08-29', channel: 'B2B', amount: 31516, eventId: 'i', agentId: null },
          { id: 'd', date: '2026-08-10', channel: 'B2B', amount: 1000, eventId: null, agentId: null }, // not a fair
        ],
        events: [
          { id: 'n', name: 'Nordstil', kind: 'fair', startDate: '2026-07-25', endDate: '2026-07-27' },
          { id: 'i', name: 'INOVA FRANKFURT', kind: 'fair', startDate: '2026-08-28', endDate: '2026-08-30' },
        ],
        agents: [], commissions: [], payments: [],
      },
      '2026-08',
    )

  it('PDF: each fair has its own revenue, no combined total, and says when the fair was in an earlier month', () => {
    const html = renderPdfHtml(twoFairs())
    expect(html).toContain('€31,516')
    expect(html).toContain('€4,404')
    expect(html).not.toContain('€35,920') // the two added together
    expect(html).not.toMatch(/All 2 fairs/)
    expect(html).toMatch(/This fair was held 25–27 Jul 2026[^<]*total so far is €32,404 from 2 orders/)
  })

  it('email: one line per fair with its own revenue', () => {
    const { html, text } = renderMonthlyEmail(twoFairs())
    expect(html).toContain('€31,516')
    expect(html).toContain('€4,404')
    expect(html).not.toContain('€35,920')
    expect(text).toMatch(/Fair — INOVA FRANKFURT: €31,516/)
    expect(text).toMatch(/Fair — Nordstil: €4,404/)
  })
})

describe('sales by month shows the figures', () => {
  it('puts every month total on the chart and a B2B / B2C / total row per month under it', () => {
    const r = buildReportData(
      {
        source: 'supabase', amountBasis: 'net_ex_vat', dataThrough: '2026-09-24',
        orders: [
          { id: 'a', date: '2026-07-10', channel: 'B2B', amount: 102000, eventId: null, agentId: null },
          { id: 'b', date: '2026-07-11', channel: 'B2C', amount: 10806, eventId: null, agentId: null },
          { id: 'c', date: '2026-08-10', channel: 'B2B', amount: 75855, eventId: null, agentId: null },
          { id: 'd', date: '2026-08-11', channel: 'B2C', amount: 5169, eventId: null, agentId: null },
        ],
        events: [], agents: [], commissions: [], payments: [],
      },
      '2026-08',
    )
    const html = renderPdfHtml(r)
    expect(html).toContain('>€113k<') // July total on its column, not only the report month
    expect(html).toMatch(/Jul 2026<\/td>\s*<td class="num">€102,000<\/td>\s*<td class="num">€10,806<\/td>\s*<td class="num strong">€112,806<\/td>/)
    expect(html).toMatch(/Aug 2026<\/td>\s*<td class="num">€75,855<\/td>\s*<td class="num">€5,169<\/td>/)
  })
})
