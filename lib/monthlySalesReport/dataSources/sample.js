/**
 * Invented data in the report's normalised shape, for layout work, tests and
 * demos. Every name says "Sample" and the report stamps it SAMPLE DATA, so a
 * test PDF can never be mistaken for a real one.
 *
 * Seeded: the same seed always gives the same numbers, so two runs of the
 * same month produce identical files.
 */

const AGENTS = [
  { id: 'sample-agent-a', name: 'Sample Agent A', rate: 0.12 },
  { id: 'sample-agent-b', name: 'Sample Agent B', rate: 0.1 },
  { id: 'sample-agent-c', name: 'Sample Agent C', rate: 0.15 },
  { id: 'sample-agent-d', name: 'Sample Agent D', rate: 0.1 },
  { id: 'sample-agent-e', name: 'Sample Agent E', rate: 0.12 },
  { id: 'sample-agent-f', name: 'Sample Agent F', rate: 0.08 },
]

// Two fairs a year in the sample calendar, each with a real date window.
const FAIRS = [
  { id: 'sample-fair-1', name: 'Sample Fair — Munich', startDate: '2025-02-14', endDate: '2025-02-17' },
  { id: 'sample-fair-2', name: 'Sample Fair — Paris', startDate: '2025-09-05', endDate: '2025-09-08' },
  { id: 'sample-fair-3', name: 'Sample Fair — Munich', startDate: '2026-02-20', endDate: '2026-02-23' },
  { id: 'sample-fair-4', name: 'Sample Fair — Copenhagen', startDate: '2026-08-06', endDate: '2026-08-08' },
  { id: 'sample-fair-5', name: 'Sample Fair — Frankfurt', startDate: '2026-08-22', endDate: '2026-08-25' },
  { id: 'sample-fair-6', name: 'Sample Fair — Paris', startDate: '2026-09-04', endDate: '2026-09-07' },
]

const GENERAL_EVENT = { id: 'sample-general', name: 'General Orders', kind: 'other' }
const ONLINE_EVENT = { id: 'sample-online', name: 'Online B2C', kind: 'other' }

// Busy summers and autumns, a quiet late winter — roughly how a jewellery
// wholesale year moves.
const SEASON = [0.6, 0.8, 0.7, 0.8, 0.9, 1.3, 1.4, 1.0, 1.5, 1.2, 1.1, 0.7]

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n) => String(n).padStart(2, '0')
const round2 = (v) => Math.round(v * 100) / 100

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * @param {object} [o]
 * @param {number} [o.seed]
 * @param {string} [o.from]    first month, 'YYYY-MM'
 * @param {string} [o.through] last day with data, 'YYYY-MM-DD'
 */
export function loadSample({ seed = 20260924, from = '2025-01', through = '2026-09-24' } = {}) {
  const rand = mulberry32(seed)
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  const orders = []
  const commissions = []
  const payments = []

  let [year, month] = from.split('-').map(Number)
  const [endY, endM, endD] = through.split('-').map(Number)
  let n = 0

  while (year < endY || (year === endY && month <= endM)) {
    const lastDay = year === endY && month === endM ? endD : daysInMonth(year, month)
    const season = SEASON[month - 1]
    const monthKey = `${year}-${pad(month)}`

    // B2B orders through agents and the general book.
    const b2bCount = Math.round((28 + rand() * 18) * season)
    for (let i = 0; i < b2bCount; i++) {
      const day = 1 + Math.floor(rand() * lastDay)
      const withAgent = rand() < 0.8
      const agent = withAgent ? pick(AGENTS) : null
      orders.push({
        id: `sample-order-${++n}`,
        date: `${monthKey}-${pad(day)}`,
        channel: 'B2B',
        amount: round2(300 + rand() * rand() * 4200),
        eventId: GENERAL_EVENT.id,
        agentId: agent ? agent.id : null,
      })
    }

    // Online B2C: many small orders.
    const b2cCount = Math.round((10 + rand() * 12) * season)
    for (let i = 0; i < b2cCount; i++) {
      orders.push({
        id: `sample-order-${++n}`,
        date: `${monthKey}-${pad(1 + Math.floor(rand() * lastDay))}`,
        channel: 'B2C',
        amount: round2(90 + rand() * 380),
        eventId: ONLINE_EVENT.id,
        agentId: null,
      })
    }

    // Fair orders, dated inside the fair's window.
    for (const fair of FAIRS.filter((f) => f.startDate.startsWith(monthKey))) {
      const start = Number(fair.startDate.slice(8, 10))
      const end = Math.min(Number(fair.endDate.slice(8, 10)), lastDay)
      if (start > lastDay) continue
      const fairCount = 12 + Math.floor(rand() * 20)
      for (let i = 0; i < fairCount; i++) {
        const agent = pick(AGENTS)
        orders.push({
          id: `sample-order-${++n}`,
          date: `${monthKey}-${pad(start + Math.floor(rand() * (end - start + 1)))}`,
          channel: 'B2B',
          amount: round2(600 + rand() * 3800),
          eventId: fair.id,
          agentId: agent.id,
          clientKey: `sample-client-${Math.floor(rand() * 40)}`,
        })
      }
    }

    // Agents are paid in the month after, for part of what they earned.
    if (rand() < 0.55) {
      for (const agent of AGENTS) {
        if (rand() < 0.5) continue
        payments.push({
          id: `sample-payment-${payments.length + 1}`,
          agentId: agent.id,
          date: `${monthKey}-${pad(Math.min(lastDay, 10 + Math.floor(rand() * 10)))}`,
          amount: round2(400 + rand() * 2600),
        })
      }
    }

    month += 1
    if (month > 12) { month = 1; year += 1 }
  }

  const rateById = Object.fromEntries(AGENTS.map((a) => [a.id, a.rate]))
  for (const order of orders) {
    if (!order.agentId) continue
    commissions.push({
      id: `sample-commission-${commissions.length + 1}`,
      agentId: order.agentId,
      orderId: order.id,
      date: order.date,
      amount: round2(order.amount * rateById[order.agentId]),
    })
  }

  return {
    source: 'sample',
    amountBasis: 'net_ex_vat',
    dataThrough: through,
    orders,
    events: [GENERAL_EVENT, ONLINE_EVENT, ...FAIRS.map((f) => ({ ...f, kind: 'fair' }))],
    agents: AGENTS.map(({ id, name }) => ({ id, name })),
    commissions,
    payments,
  }
}
