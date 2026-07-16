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
  getAgentNavItems,
  getMainNavItems,
} from '../navItems'

describe('AGENT_NAV_ITEMS', () => {
  it('exposes the expected items in the documented order', () => {
    expect(AGENT_NAV_ITEMS.map((i) => i.id)).toEqual([
      'agent-dashboard',
      'agent-team',
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

describe('getAgentNavItems (Team gating)', () => {
  it('hides the Team item for agents with no org membership', () => {
    const ids = getAgentNavItems(null).map((i) => i.id)
    expect(ids).not.toContain('agent-team')
    expect(ids).toContain('agent-dashboard')
  })

  it('shows the Team item for ANY org member — owner or member', () => {
    for (const role of ['owner', 'member']) {
      const ids = getAgentNavItems({ organization_id: 'org-1', role }).map((i) => i.id)
      expect(ids).toContain('agent-team')
    }
  })

  it('Team entry routes to /agent/team', () => {
    const team = getAgentNavItems({ organization_id: 'org-1', role: 'member' }).find((i) => i.id === 'agent-team')
    expect(team.href).toBe('/agent/team')
  })
})

describe('resolveAgentActiveId', () => {
  it('returns agent-dashboard for /agent', () => {
    expect(resolveAgentActiveId('/agent')).toBe('agent-dashboard')
  })

  it('returns agent-team for /agent/team', () => {
    expect(resolveAgentActiveId('/agent/team')).toBe('agent-team')
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

  it('includes the Organizations entry routing to /admin/organizations', () => {
    const org = ADMIN_NAV_ITEMS.find((i) => i.id === 'organizations')
    expect(org).toBeDefined()
    expect(org.href).toBe('/admin/organizations')
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
  })

  it('no longer shows the Consignment tab in the main sidebar (removed July 2026)', () => {
    const ids = getMainNavItems({ role: 'admin' }).map((i) => i.id)
    expect(ids).not.toContain('consignment')
  })
})
