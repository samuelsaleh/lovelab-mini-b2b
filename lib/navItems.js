/**
 * Central source of truth for all navigation items.
 * Sidebar.jsx imports from here — no nav arrays defined inline in layouts.
 */

/**
 * Returns the main app nav items, filtered by role.
 * Analytics and Reports are removed — they live in role-specific portals.
 *
 * @param {object|null} profile
 * @returns {Array<{ id: string, label: string, href?: string }>}
 */
export function getMainNavItems(profile) {
  const isAdmin = profile?.role === 'admin'

  return [
    { id: 'home',      label: 'Home' },
    { id: 'builder',   label: 'Builder' },
    { id: 'photos',    label: 'Product Photos' },
    ...(isAdmin ? [
      { id: 'ai',              label: 'AI Advisor' },
      { id: 'internal_orders', label: 'Internal Orders' },
      { id: 'consignment',     label: 'Consignment' },
    ] : []),
    { id: 'documents', label: 'Documents' },
  ]
}

/** Admin portal nav items. */
export const ADMIN_NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',    href: '/admin' },
  { id: 'agents',       label: 'Agents',       href: '/admin/agents' },
  { id: 'fairs',        label: 'Fairs',        href: '/admin/fairs' },
  { id: 'consignment',  label: 'Consignment',  href: '/admin/consignment' },
  { id: 'analytics',    label: 'Analytics',    href: '/analytics' },
  { id: 'reports',      label: 'Reports',      href: '/admin/reports' },
  { id: 'back',         label: 'Back to App',  href: '/', isBack: true },
]

/** Agent portal nav items.
 *
 * Order matters — this is the visual order in the sidebar.
 *
 * Dashboard, Analytics, and Reports each show DIFFERENT things:
 *   • Dashboard   → financial overview: hero card, 4 KPI cards, multi-tab
 *                   workspace (Financials / Reports / Consignment /
 *                   Organisation / Documents). The "do everything" page.
 *   • Analytics   → charts and trends scoped to this agent's data
 *                   (revenue per fair, top collections, top countries).
 *                   Reuses the admin AnalyticsDashboard component.
 *   • Reports     → focused list of downloadable monthly commission PDFs.
 *                   No KPI strip, no tab strip — just the reports table.
 *   • Documents / Contracts / My Consignments → focused single-purpose
 *                   pages, same `focused` mode (no shared scaffold).
 */
export const AGENT_NAV_ITEMS = [
  { id: 'agent-dashboard',     label: 'Dashboard',        href: '/agent' },
  { id: 'agent-analytics',     label: 'Analytics',        href: '/agent/analytics' },
  { id: 'agent-reports',       label: 'Reports',          href: '/agent/reports' },
  { id: 'agent-documents',     label: 'Documents',        href: '/agent/documents' },
  { id: 'agent-contracts',     label: 'Contracts',        href: '/agent/contracts' },
  { id: 'agent-consignment',   label: 'My Consignments',  href: '/agent/consignment' },
  { id: 'back',                label: 'Back to App',      href: '/', isBack: true },
]

/** Resolves the active sidebar item id for the agent portal. */
export function resolveAgentActiveId(pathname) {
  if (pathname === '/agent') return 'agent-dashboard'
  if (pathname.startsWith('/agent/analytics'))    return 'agent-analytics'
  if (pathname.startsWith('/agent/reports'))      return 'agent-reports'
  if (pathname.startsWith('/agent/documents'))    return 'agent-documents'
  if (pathname.startsWith('/agent/contracts'))    return 'agent-contracts'
  if (pathname.startsWith('/agent/consignment'))  return 'agent-consignment'
  return 'agent-dashboard'
}
