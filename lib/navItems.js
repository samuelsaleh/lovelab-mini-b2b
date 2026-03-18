/**
 * Central source of truth for all navigation items.
 * Sidebar.jsx imports from here — no nav arrays defined inline in layouts.
 */

/**
 * Returns the main app nav items, filtered by role.
 * Items with an `href` are router-navigated by Sidebar internally.
 * Items without `href` call onSelect(id).
 *
 * @param {object|null} profile
 * @returns {Array<{ id: string, label: string, href?: string }>}
 */
export function getMainNavItems(profile) {
  const isAdmin = profile?.role === 'admin'

  return [
    { id: 'home',      label: 'Home' },
    { id: 'builder',   label: 'Builder' },
    ...(isAdmin ? [
      { id: 'ai',             label: 'AI Advisor' },
      { id: 'orderform',      label: 'Order Form' },
      { id: 'internal_orders', label: 'Internal Orders' },
    ] : []),
    { id: 'analytics', label: 'Analytics', href: '/analytics' },
    { id: 'reports',   label: 'Reports',   href: '/reports' },
    { id: 'documents', label: 'Documents' },
  ]
}

/** Admin section nav items — always full set, no role filtering needed. */
export const ADMIN_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin' },
  { id: 'agents',    label: 'Agents',    href: '/admin/agents' },
  { id: 'fairs',     label: 'Fairs',     href: '/admin/fairs' },
  { id: 'clients',   label: 'Clients',   href: '/admin/clients' },
  { id: 'back',      label: 'Back to App', href: '/', isBack: true },
]
