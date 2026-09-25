import { buildReportData, shiftMonth, CHART_AGENTS } from '../buildReportData.js'

const order = (id, date, channel, amount, extra = {}) => ({ id, date, channel, amount, eventId: null, agentId: null, ...extra })

function model(over = {}) {
  return {
    source: 'test',
    amountBasis: 'net_ex_vat',
    dataThrough: '2026-09-24',
    orders: [],
    events: [],
    agents: [],
    commissions: [],
    payments: [],
    ...over,
  }
}

describe('shiftMonth', () => {
  it('crosses year boundaries both ways', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-08', -11)).toBe('2025-09')
  })
})

describe('buildReportData', () => {
  it('puts each order in its own month, including the last and first day', () => {
    const r = buildReportData(
      model({ orders: [order('a', '2026-07-31', 'B2B', 100), order('b', '2026-08-01', 'B2B', 200), order('c', '2026-08-31', 'B2C', 50), order('d', '2026-09-01', 'B2B', 999)] }),
      '2026-08',
    )
    expect(r.kpis.sales).toBe(250)
    expect(r.kpis.orders).toBe(2)
    expect(r.kpis.salesPrev).toBe(100)
  })

  it('splits B2B and B2C and gives the B2B share', () => {
    const r = buildReportData(model({ orders: [order('a', '2026-08-02', 'B2B', 750), order('b', '2026-08-03', 'B2C', 250)] }), '2026-08')
    expect(r.kpis.b2b).toBe(750)
    expect(r.kpis.b2c).toBe(250)
    expect(r.kpis.b2bShare).toBe(75)
    expect(r.channelSplit.month).toEqual({ b2b: 750, b2c: 250 })
  })

  it('computes the change vs the previous month, and null when that month had nothing', () => {
    const withPrev = buildReportData(model({ orders: [order('a', '2026-07-10', 'B2B', 200), order('b', '2026-08-10', 'B2B', 250)] }), '2026-08')
    expect(withPrev.kpis.salesChangePct).toBe(25)
    const noPrev = buildReportData(model({ orders: [order('b', '2026-08-10', 'B2B', 250)] }), '2026-08')
    expect(noPrev.kpis.salesChangePct).toBeNull()
  })

  it('builds a 12-month trend ending on the report month, clipped to where data starts', () => {
    const full = buildReportData(model({ orders: [order('x', '2024-01-05', 'B2B', 1), order('a', '2026-08-10', 'B2B', 10)] }), '2026-08')
    expect(full.trend).toHaveLength(12)
    expect(full.trend[0].month).toBe('2025-09')
    expect(full.trend[11]).toMatchObject({ month: '2026-08', isReportMonth: true, total: 10 })

    const clipped = buildReportData(model({ orders: [order('a', '2026-06-10', 'B2B', 10)] }), '2026-08')
    expect(clipped.trend.map((t) => t.month)).toEqual(['2026-06', '2026-07', '2026-08'])
  })

  it('counts year to date from January of the report year up to the report month', () => {
    const r = buildReportData(
      model({ orders: [order('a', '2025-12-31', 'B2B', 1000), order('b', '2026-01-02', 'B2B', 10), order('c', '2026-08-02', 'B2C', 5), order('d', '2026-09-02', 'B2B', 99)] }),
      '2026-08',
    )
    expect(r.channelSplit.ytd).toEqual({ b2b: 10, b2c: 5 })
  })

  it('splits by agent, puts the no-agent row last, and joins earned and paid-out commission', () => {
    const r = buildReportData(
      model({
        agents: [{ id: 'a1', name: 'Ann' }, { id: 'a2', name: 'Bob' }],
        orders: [order('o1', '2026-08-01', 'B2B', 100, { agentId: 'a1' }), order('o2', '2026-08-02', 'B2B', 300, { agentId: 'a2' }), order('o3', '2026-08-03', 'B2C', 100)],
        commissions: [{ id: 'c1', agentId: 'a2', orderId: 'o2', date: '2026-08-02', amount: 30 }, { id: 'c0', agentId: 'a1', orderId: null, date: '2026-07-20', amount: 999 }],
        payments: [{ id: 'p1', agentId: 'a1', date: '2026-08-15', amount: 45 }],
      }),
      '2026-08',
    )
    expect(r.agents.map((a) => a.name)).toEqual(['Bob', 'Ann', 'No agent (direct & online)'])
    expect(r.agents[0]).toMatchObject({ orders: 1, sales: 300, commissionEarned: 30, commissionPaidOut: 0, share: 60 })
    expect(r.agents[1]).toMatchObject({ sales: 100, commissionEarned: 0, commissionPaidOut: 45 })
    expect(r.kpis.commissionEarned).toBe(30) // July's bonus stays in July
    expect(r.kpis.commissionPaidOut).toBe(45)
    expect(r.topAgents.map((a) => a.name)).toEqual(['Bob', 'Ann'])
  })

  it('lists an agent who was only paid this month, with no sales', () => {
    const r = buildReportData(model({ agents: [{ id: 'a1', name: 'Ann' }], payments: [{ id: 'p', agentId: 'a1', date: '2026-08-05', amount: 10 }] }), '2026-08')
    expect(r.agents).toEqual([expect.objectContaining({ name: 'Ann', sales: 0, commissionPaidOut: 10 })])
  })

  it(`charts the top ${CHART_AGENTS} agents and sums the rest into a note, not a bar`, () => {
    const agents = Array.from({ length: 11 }, (_, i) => ({ id: `a${i}`, name: `Agent ${i}` }))
    const orders = agents.map((a, i) => order(`o${i}`, '2026-08-05', 'B2B', 100 + i, { agentId: a.id }))
    const r = buildReportData(model({ agents, orders }), '2026-08')
    expect(r.agentChart).toHaveLength(CHART_AGENTS)
    expect(r.agentChart[0]).toEqual({ name: 'Agent 10', value: 110 })
    expect(r.agentChartRest).toEqual({ count: 3, value: 100 + 101 + 102 })
    expect(buildReportData(model({ agents, orders: orders.slice(0, 2) }), '2026-08').agentChartRest).toBeNull()
  })

  it('reports only fair events, net of the commission earned on their orders', () => {
    const r = buildReportData(
      model({
        events: [{ id: 'f', name: 'Bijorhca', kind: 'fair', startDate: '2026-08-06', endDate: '2026-08-08' }, { id: 'g', name: 'General Orders', kind: 'other' }],
        orders: [order('o1', '2026-08-06', 'B2B', 1000, { eventId: 'f', agentId: 'a' }), order('o2', '2026-08-07', 'B2B', 500, { eventId: 'f' }), order('o3', '2026-08-07', 'B2B', 700, { eventId: 'g' })],
        commissions: [{ id: 'c', agentId: 'a', orderId: 'o1', date: '2026-08-06', amount: 120 }],
      }),
      '2026-08',
    )
    expect(r.fairs).toEqual([expect.objectContaining({ name: 'Bijorhca', orders: 2, sales: 1500, commission: 120, net: 1380 })])
    expect(r.kpis.fairCount).toBe(1)
    expect(r.kpis.topFair.name).toBe('Bijorhca')
  })

  it('says so plainly when a month has no sales and no fairs', () => {
    const r = buildReportData(model({ orders: [order('a', '2026-07-10', 'B2B', 50)] }), '2026-08')
    expect(r.kpis.sales).toBe(0)
    expect(r.kpis.b2bShare).toBe(0)
    expect(r.fairs).toEqual([])
    expect(r.kpis.topFair).toBeNull()
    expect(r.notes).toContain('No sales recorded for August 2026.')
  })

  it('flags a month that is not over yet as partial', () => {
    const r = buildReportData(model({ dataThrough: '2026-09-24', orders: [order('a', '2026-09-10', 'B2B', 5)] }), '2026-09')
    expect(r.partial).toBe(true)
    expect(r.notes.join(' ')).toMatch(/Partial month — data up to 2026-09-24/)
    expect(buildReportData(model(), '2026-08').partial).toBe(false)
  })

  it('marks sample data so every output can stamp it', () => {
    expect(buildReportData(model({ source: 'sample' }), '2026-08').isSample).toBe(true)
    expect(buildReportData(model({ source: 'supabase' }), '2026-08').isSample).toBe(false)
  })

  it('rejects a malformed or impossible month', () => {
    for (const m of ['2026-8', '2026-13', '2026-00']) expect(() => buildReportData(model(), m)).toThrow(/YYYY-MM/)
  })
})

describe('fair detail', () => {
  const m = () =>
    model({
      events: [
        { id: 'f1', name: 'Nordstil', kind: 'fair', startDate: '2026-07-25', endDate: '2026-07-27' },
        { id: 'f2', name: 'INOVA', kind: 'fair', startDate: '2026-08-28', endDate: '2026-08-30' },
        { id: 'f0', name: 'INHORGENTA', kind: 'fair', startDate: '2026-02-20', endDate: '2026-02-23' },
      ],
      orders: [
        order('a', '2026-07-26', 'B2B', 1000, { eventId: 'f1', agentId: 'x', clientKey: 'shop1' }),
        order('b', '2026-08-02', 'B2B', 300, { eventId: 'f1', clientKey: 'shop2' }),
        order('c', '2026-08-29', 'B2B', 500, { eventId: 'f2', clientKey: 'shop3' }),
        order('d', '2026-08-29', 'B2B', 700, { eventId: 'f2', agentId: 'y', clientKey: 'shop3' }),
        order('e', '2026-02-21', 'B2B', 4000, { eventId: 'f0', clientKey: 'shop9' }),
        order('z', '2026-09-01', 'B2B', 9999, { eventId: 'f2', clientKey: 'shop4' }),
      ],
      commissions: [
        { id: 'c1', agentId: 'y', orderId: 'd', date: '2026-08-29', amount: 70 },
        { id: 'c2', agentId: 'x', orderId: 'a', date: '2026-07-26', amount: 100 },
      ],
    })

  it('gives every number per fair for the month, plus its running total up to month end', () => {
    const r = buildReportData(m(), '2026-08')
    expect(r.fairs.map((f) => f.name)).toEqual(['INOVA', 'Nordstil'])
    expect(r.fairs[0]).toMatchObject({ orders: 2, clients: 1, sales: 1200, avgOrder: 600, biggestOrder: 700, agentOrders: 1, commission: 70, net: 1130, salesToDate: 1200, ordersToDate: 2 })
    // Nordstil: 300 this month, 1300 since the fair; September's INOVA order is not counted.
    expect(r.fairs[1]).toMatchObject({ orders: 1, sales: 300, commission: 0, salesToDate: 1300, ordersToDate: 2 })
  })

  it('lists every fair of the year so far with its total revenue', () => {
    const r = buildReportData(m(), '2026-08')
    expect(r.fairsYear.map((f) => [f.name, f.sales, f.commission, f.net])).toEqual([
      ['INHORGENTA', 4000, 0, 4000],
      ['Nordstil', 1300, 100, 1200],
      ['INOVA', 1200, 70, 1130],
    ])
  })
})
