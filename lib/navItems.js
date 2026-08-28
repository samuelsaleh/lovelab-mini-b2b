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

  // Commercial assistants get a focused workspace: build orders and see the
  // documents inside their assigned fairs. No product photos, no portals.
  if (!isAdmin && profile?.is_assistant) {
    return [
      { id: 'home',      label: 'Home' },
      { id: 'builder',   label: 'Builder' },
      { id: 'documents', label: 'Documents' },
    ]
  }

  return [
    { id: 'home',      label: 'Home' },
    { id: 'builder',   label: 'Builder' },
    { id: 'photos',    label: 'Product Photos' },
    ...(isAdmin ? [
      // AI Advisor lives inside Builder as "Build with Claude".
      // Internal Orders + Consignment live in the admin portal, not here.
    ] : []),
    { id: 'documents', label: 'Documents' },
  ]
}

/** Admin portal nav items.
 *
 * Reorganized with submenus (Sam, Aug 2026): one Sales Team workspace
 * contains Agents / Assistants / Agent Teams as in-page tabs; Fairs groups
 * the fair pages.
 * Consignment was removed from the menu — the /admin/consignment page still
 * exists and is reachable by URL, it just isn't advertised anymore.
 *
 * Items with `children` render as expandable groups in the Sidebar; only
 * leaf items have an href.
 */
export const ADMIN_NAV_ITEMS = [
  { id: 'dashboard',        label: 'Dashboard',        href: '/admin' },
  { id: 'sales-team',       label: 'Sales Team',       href: '/admin/agents' },
  { id: 'out-memos',        label: 'Out Memos',        href: '/admin/out-memos' },
  { id: 'internal-orders',  label: 'Internal Orders',  href: '/admin/internal-orders' },
  {
    id: 'fairs-group',
    label: 'Fairs',
    children: [
      { id: 'fairs',          label: 'All Fairs',      href: '/admin/fairs' },
      { id: 'fair-assistant', label: 'Fair Assistant', href: '/admin/fair-assistant' },
    ],
  },
  {
    id: 'certificates-group',
    label: 'Certificates',
    children: [
      { id: 'certificates',          label: 'Dashboard',      href: '/admin/certificates' },
      { id: 'certificates-request',  label: 'New request',    href: '/admin/certificates/requests' },
      { id: 'certificates-visits',   label: 'Visits',         href: '/admin/certificates/visits' },
      { id: 'certificates-invoices', label: 'Invoices',       href: '/admin/certificates/invoices' },
      { id: 'certificates-stock',    label: 'Stock & alerts', href: '/admin/certificates/stock' },
      { id: 'certificates-models',   label: 'Models',         href: '/admin/certificates/models' },
      { id: 'certificates-matching', label: 'Matching',       href: '/admin/certificates/matching' },
    ],
  },
  { id: 'analytics',    label: 'Analytics',        href: '/analytics' },
  { id: 'reports',      label: 'Customer Reports', href: '/admin/reports' },
  { id: 'back',         label: 'Back to App',      href: '/', isBack: true },
]

/** IGI portal nav items.
 *
 * EXACTLY FIVE, each doing exactly one thing. "To do" is the whole product for
 * them; the rest exist so they never have to ask LoveLab a question they could
 * answer themselves.
 *
 * There is deliberately no "Back to App" item — IGI are another company and have
 * nowhere in this app to go back to. lib/__tests__/igi-nav.test.js holds the
 * five-item line, because a sixth is how a tool that does one thing becomes a
 * tool that does several badly.
 */
export const IGI_NAV_ITEMS = [
  { id: 'igi-todo',     label: 'To do',       href: '/igi' },
  { id: 'igi-stock',    label: 'My stock',    href: '/igi/stock' },
  { id: 'igi-batch',    label: 'Add a batch', href: '/igi/batch' },
  { id: 'igi-history',  label: 'History',     href: '/igi/history' },
  { id: 'igi-invoices', label: 'Invoices',    href: '/igi/invoices' },
]

/** Resolves the active sidebar item id for the IGI portal. */
export function resolveIgiActiveId(pathname) {
  if (pathname.startsWith('/igi/stock'))    return 'igi-stock'
  if (pathname.startsWith('/igi/batch'))    return 'igi-batch'
  if (pathname.startsWith('/igi/history'))  return 'igi-history'
  if (pathname.startsWith('/igi/invoices')) return 'igi-invoices'
  return 'igi-todo'
}

/** Flattens grouped nav items into leaf items (groups replaced by their children). */
export function flattenNavItems(items) {
  return items.flatMap((item) => (item.children ? item.children : [item]))
}

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
  { id: 'agent-team',          label: 'Team',             href: '/agent/team', requiresOrg: true },
  { id: 'agent-analytics',     label: 'Analytics',        href: '/agent/analytics' },
  { id: 'agent-reports',       label: 'Reports',          href: '/agent/reports' },
  { id: 'agent-documents',     label: 'Documents',        href: '/agent/documents' },
  { id: 'agent-contracts',     label: 'Contracts',        href: '/agent/contracts' },
  { id: 'agent-consignment',   label: 'My Consignments',  href: '/agent/consignment' },
  { id: 'back',                label: 'Back to App',      href: '/', isBack: true },
]

/**
 * Agent portal nav items, filtered by the agent's org membership.
 * The Team page only makes sense for agents who belong to an organization
 * (in practice all agents — every invite auto-creates one).
 *
 * @param {object|null} orgMembership - { organization_id, role } from useAuth()
 */
export function getAgentNavItems(orgMembership) {
  return AGENT_NAV_ITEMS.filter((item) => !item.requiresOrg || Boolean(orgMembership?.organization_id))
}

/** Resolves the active sidebar item id for the agent portal. */
export function resolveAgentActiveId(pathname) {
  if (pathname === '/agent') return 'agent-dashboard'
  if (pathname.startsWith('/agent/team'))         return 'agent-team'
  if (pathname.startsWith('/agent/analytics'))    return 'agent-analytics'
  if (pathname.startsWith('/agent/reports'))      return 'agent-reports'
  if (pathname.startsWith('/agent/documents'))    return 'agent-documents'
  if (pathname.startsWith('/agent/contracts'))    return 'agent-contracts'
  if (pathname.startsWith('/agent/consignment'))  return 'agent-consignment'
  return 'agent-dashboard'
}
