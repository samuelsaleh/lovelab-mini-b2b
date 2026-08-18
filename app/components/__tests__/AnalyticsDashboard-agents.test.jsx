/**
 * AnalyticsDashboard — agent dimension aggregators (pure).
 *
 * revenuePerAgent:
 *   ✓ sums revenue + order count per agent_id, names resolved via map
 *   ✓ orders with no agent_id fall under a single "No agent" bucket
 *   ✓ ignores non-order document types
 *
 * buildAgentFairMatrix (the "who sold what, at which fair" cross-tab):
 *   ✓ only counts orders that have BOTH an agent and a fair event
 *   ✓ each order counted once (no double count) — cell + row + col agree
 *   ✓ respects the fairIds allow-list (agent-folder events excluded)
 */

// Pure helpers don't render, but importing the module pulls in recharts —
// stub it so jsdom never tries real DOM measurements.
jest.mock('recharts', () => new Proxy({}, { get: () => () => null }))

import { revenuePerAgent, buildAgentFairMatrix } from '../AnalyticsDashboard'

const agentNameById = { a1: 'Bastian', a2: 'Silke' }
const fairNameById = { f1: 'Nordstil', f2: 'INHORGENTA' }
const fairIds = new Set(['f1', 'f2'])

describe('revenuePerAgent', () => {
  test('sums revenue + orders per agent and resolves names', () => {
    const docs = [
      { document_type: 'order', agent_id: 'a1', total_amount: 100 },
      { document_type: 'order', agent_id: 'a1', total_amount: 50 },
      { document_type: 'order', agent_id: 'a2', total_amount: 200 },
    ]
    const rows = revenuePerAgent(docs, agentNameById)
    expect(rows).toEqual([
      { id: 'a2', name: 'Silke', revenue: 200, orders: 1 },
      { id: 'a1', name: 'Bastian', revenue: 150, orders: 2 },
    ])
  })

  test('orders without agent_id fall under a single No agent bucket', () => {
    const docs = [
      { document_type: 'order', agent_id: null, total_amount: 40 },
      { document_type: 'order', agent_id: undefined, total_amount: 60 },
    ]
    const rows = revenuePerAgent(docs, agentNameById)
    expect(rows).toEqual([{ id: '__none__', name: 'No agent', revenue: 100, orders: 2 }])
  })

  test('ignores non-order document types', () => {
    const docs = [
      { document_type: 'quote', agent_id: 'a1', total_amount: 999 },
      { document_type: 'order', agent_id: 'a1', total_amount: 10 },
    ]
    const rows = revenuePerAgent(docs, agentNameById)
    expect(rows).toEqual([{ id: 'a1', name: 'Bastian', revenue: 10, orders: 1 }])
  })
})

describe('buildAgentFairMatrix', () => {
  test('counts only orders with both an agent and a fair, once each', () => {
    const docs = [
      { document_type: 'order', agent_id: 'a1', event_id: 'f1', total_amount: 100 }, // Bastian @ Nordstil
      { document_type: 'order', agent_id: 'a2', event_id: 'f1', total_amount: 300 }, // Silke @ Nordstil
      { document_type: 'order', agent_id: 'a2', event_id: 'f2', total_amount: 200 }, // Silke @ INHORGENTA
      { document_type: 'order', agent_id: 'a1', event_id: null, total_amount: 999 }, // no fair → excluded
      { document_type: 'order', agent_id: null, event_id: 'f1', total_amount: 999 }, // no agent → excluded
    ]
    const { fairs, agents, cells } = buildAgentFairMatrix(docs, { agentNameById, fairNameById, fairIds })

    expect(cells.get('a1|f1')).toMatchObject({ orders: 1, revenue: 100 })
    expect(cells.get('a2|f1')).toMatchObject({ orders: 1, revenue: 300 })
    expect(cells.get('a2|f2')).toMatchObject({ orders: 1, revenue: 200 })
    expect(cells.get('a1|f2')).toBeUndefined()

    // No double count: sum of cells equals sum of the qualifying orders (600).
    const cellSum = [...cells.values()].reduce((s, c) => s + c.revenue, 0)
    expect(cellSum).toBe(600)

    // Row / column totals reconcile with the cells.
    const silke = agents.find(a => a.id === 'a2')
    expect(silke.revenue).toBe(500)
    const nordstil = fairs.find(f => f.id === 'f1')
    expect(nordstil.revenue).toBe(400)
  })

  test('respects the fairIds allow-list (agent-folder events excluded)', () => {
    const docs = [
      { document_type: 'order', agent_id: 'a1', event_id: 'agentFolder', total_amount: 100 },
      { document_type: 'order', agent_id: 'a1', event_id: 'f1', total_amount: 50 },
    ]
    const { cells } = buildAgentFairMatrix(docs, { agentNameById, fairNameById, fairIds })
    expect(cells.get('a1|agentFolder')).toBeUndefined()
    expect(cells.get('a1|f1')).toMatchObject({ orders: 1, revenue: 50 })
  })
})
