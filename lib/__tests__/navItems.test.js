/**
 * navItems — sidebar configuration tests
 *
 * Locks down the agent sidebar layout so the Dashboard ↔ Reports ↔
 * Analytics distinction can't silently regress. The bug Sam reported on
 * 10/05/2026 was that Dashboard and Reports rendered identical layouts;
 * after the fix, the sidebar exposes a separate Analytics entry and
 * each link routes to a meaningfully different page.
 */

import {
  AGENT_NAV_ITEMS,
  ADMIN_NAV_ITEMS,
  resolveAgentActiveId,
  getMainNavItems,
} from '../navItems'

describe('AGENT_NAV_ITEMS', () => {
  it('exposes the six expected items in the documented order', () => {
    expect(AGENT_NAV_ITEMS.map((i) => i.id)).toEqual([
      'agent-dashboard',
      'agent-analytics',
      'agent-reports',
      'agent-documents',
      'agent-contracts',
      'agent-consignment',
      'back',
    ])
  })

  it('every nav item has a unique id and an href (except back)', () => {
    const ids = AGENT_NAV_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of AGENT_NAV_ITEMS) {
      expect(item.href).toBeTruthy()
    }
  })

  it('Analytics entry routes to /agent/analytics (separate page from Dashboard)', () => {
    const analytics = AGENT_NAV_ITEMS.find((i) => i.id === 'agent-analytics')
    expect(analytics).toBeDefined()
    expect(analytics.href).toBe('/agent/analytics')
    expect(analytics.label).toBe('Analytics')
    // Dashboard and Analytics MUST point to different routes — that's the
    // whole point of the redesign.
    const dashboard = AGENT_NAV_ITEMS.find((i) => i.id === 'agent-dashboard')
    expect(dashboard.href).not.toBe(analytics.href)
  })
})

describe('resolveAgentActiveId', () => {
  it('returns agent-dashboard for /agent', () => {
    expect(resolveAgentActiveId('/agent')).toBe('agent-dashboard')
  })

  it('returns agent-analytics for /agent/analytics and subpaths', () => {
    expect(resolveAgentActiveId('/agent/analytics')).toBe('agent-analytics')
    expect(resolveAgentActiveId('/agent/analytics/foo')).toBe('agent-analytics')
  })

  it('returns agent-reports for /agent/reports', () => {
    expect(resolveAgentActiveId('/agent/reports')).toBe('agent-reports')
  })

  it('returns agent-documents for /agent/documents', () => {
    expect(resolveAgentActiveId('/agent/documents')).toBe('agent-documents')
  })

  it('returns agent-contracts for /agent/contracts', () => {
    expect(resolveAgentActiveId('/agent/contracts')).toBe('agent-contracts')
  })

  it('returns agent-consignment for /agent/consignment', () => {
    expect(resolveAgentActiveId('/agent/consignment')).toBe('agent-consignment')
  })

  it('falls back to agent-dashboard for unknown paths', () => {
    expect(resolveAgentActiveId('/agent/random')).toBe('agent-dashboard')
  })
})

describe('ADMIN_NAV_ITEMS (sanity — should not regress)', () => {
  it('still includes Dashboard, Analytics and Reports as separate entries', () => {
    const ids = ADMIN_NAV_ITEMS.map((i) => i.id)
    expect(ids).toContain('dashboard')
    expect(ids).toContain('analytics')
    expect(ids).toContain('reports')
  })
})

describe('getMainNavItems', () => {
  it('returns role-appropriate items for an agent', () => {
    const items = getMainNavItems({ role: 'member', is_agent: true })
    const ids = items.map((i) => i.id)
    expect(ids).toContain('home')
    expect(ids).toContain('builder')
    expect(ids).toContain('documents')
    // Admin-only items must not leak to agents
    expect(ids).not.toContain('ai')
    expect(ids).not.toContain('internal_orders')
    expect(ids).not.toContain('consignment')
  })

  it('returns admin-only items for admins', () => {
    const items = getMainNavItems({ role: 'admin' })
    const ids = items.map((i) => i.id)
    expect(ids).toContain('ai')
    expect(ids).toContain('internal_orders')
    expect(ids).toContain('consignment')
  })
})
