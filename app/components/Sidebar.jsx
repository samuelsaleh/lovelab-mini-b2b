'use client'

import { memo, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'

// ─── SVG Icons ──────────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function BuilderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  )
}

function AIIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  )
}

function OrderFormIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}

function AnalyticsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
}

function ReportsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  )
}

function DocumentsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  )
}

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
    </svg>
  )
}

function AgentsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  )
}

function FairsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

function ClientsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
    </svg>
  )
}

function ContractIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  )
}

function PhotosIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  )
}

function CertificateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="6"/>
      <polyline points="8.5 14.5 7 22 12 19.5 17 22 15.5 14.5"/>
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  )
}

function CollapseIcon({ collapsed }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
    >
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}

// ─── Icon map ────────────────────────────────────────────────────────────────

function InternalOrdersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2"/>
      <path d="M9 3h6v4H9z"/>
      <line x1="8" y1="11" x2="16" y2="11"/>
      <line x1="8" y1="15" x2="16" y2="15"/>
      <line x1="8" y1="19" x2="13" y2="19"/>
    </svg>
  )
}

function AssistantIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/>
      <line x1="20" y1="8" x2="20" y2="14"/>
      <line x1="17" y1="11" x2="23" y2="11"/>
    </svg>
  )
}

function OrganizationsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2"/>
      <line x1="9" y1="7" x2="9.01" y2="7"/><line x1="15" y1="7" x2="15.01" y2="7"/>
      <line x1="9" y1="11" x2="9.01" y2="11"/><line x1="15" y1="11" x2="15.01" y2="11"/>
      <path d="M10 22v-4h4v4"/>
    </svg>
  )
}

const ICONS = {
  home:             <HomeIcon />,
  builder:          <BuilderIcon />,
  ai:               <AIIcon />,
  orderform:        <OrderFormIcon />,
  internal_orders:     <InternalOrdersIcon />,
  'internal-orders':   <InternalOrdersIcon />,
  analytics:        <AnalyticsIcon />,
  reports:          <ReportsIcon />,
  documents:        <DocumentsIcon />,
  dashboard:        <DashboardIcon />,
  agents:           <AgentsIcon />,
  assistants:       <AssistantIcon />,
  organizations:    <OrganizationsIcon />,
  people:           <AgentsIcon />,
  'sales-team':     <AgentsIcon />,
  fairs:            <FairsIcon />,
  'fairs-group':    <FairsIcon />,
  'fair-assistant': <AIIcon />,
  clients:          <ClientsIcon />,
  photos:           <PhotosIcon />,
  back:             <BackIcon />,
  // Agent portal items
  'agent-dashboard': <DashboardIcon />,
  'agent-reports':   <ReportsIcon />,
  'agent-documents': <DocumentsIcon />,
  'agent-contracts': <ContractIcon />,

  // Certificates (LoveLab x IGI). An id with no entry here silently falls back
  // to the home icon, so every leaf added to navItems.js needs a line.
  'certificates':          <CertificateIcon />,
  'certificates-group':    <CertificateIcon />,
  'certificates-request':  <OrderFormIcon />,
  'certificates-visits':   <FairsIcon />,
  'certificates-stock':    <AnalyticsIcon />,
  'certificates-models':   <ContractIcon />,
  'certificates-matching': <ClientsIcon />,
}

// ─── Sidebar component ───────────────────────────────────────────────────────

/**
 * Sidebar navigation component.
 *
 * Props:
 *   items            — array of { id, label, href?, isBack? } leaf items, or
 *                      { id, label, children: [leaf items] } expandable groups
 *   activeId         — currently active item id (always a LEAF id)
 *   onSelect(id)     — called when an item without href is clicked
 *   mobile           — boolean; when true, renders as a fixed drawer
 *   isOpen           — controls drawer visibility (mobile only)
 *   onClose          — called when backdrop is clicked (mobile only)
 *   collapsed        — desktop collapsed state (icon-only mode; groups are
 *                      flattened to their children so every page stays reachable)
 *   onToggleCollapse — toggles desktop collapsed state
 */
function Sidebar({ items = [], activeId, onSelect, mobile, isOpen, onClose, collapsed, onToggleCollapse }) {
  const router = useRouter()

  const groupWithActiveChild = items.find(
    (item) => item.children?.some((child) => child.id === activeId)
  )?.id || null

  // Groups start closed (that's the whole decluttering point) except the one
  // holding the current page. Navigating into a group's page auto-opens it;
  // manually opened groups stay open until toggled.
  const [openGroups, setOpenGroups] = useState(
    () => new Set(groupWithActiveChild ? [groupWithActiveChild] : [])
  )

  useEffect(() => {
    if (!groupWithActiveChild) return
    setOpenGroups((prev) => {
      if (prev.has(groupWithActiveChild)) return prev
      const next = new Set(prev)
      next.add(groupWithActiveChild)
      return next
    })
  }, [groupWithActiveChild])

  const toggleGroup = (groupId) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const handleItemClick = (item) => {
    if (item.href) {
      router.push(item.href)
    } else {
      onSelect?.(item.id)
    }
    if (mobile) onClose?.()
  }

  const renderLeaf = (item, indented = false) => {
    const isActive = item.id === activeId
    const icon = ICONS[item.id] || ICONS.home
    const indent = indented && (!collapsed || mobile)

    return (
      <button
        key={item.id}
        data-testid={`sidebar-item-${item.id}`}
        onClick={() => handleItemClick(item)}
        title={collapsed && !mobile ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: indent ? 10 : 12,
          padding: collapsed && !mobile ? '12px 0' : indent ? '9px 16px 9px 34px' : '11px 16px',
          justifyContent: collapsed && !mobile ? 'center' : 'flex-start',
          border: 'none',
          borderRadius: 8,
          margin: '1px 6px',
          width: 'calc(100% - 12px)',
          background: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
          color: isActive ? '#fff' : item.isBack ? 'rgba(255,255,255,0.65)' : indent ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.88)',
          fontWeight: isActive ? 700 : 500,
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: fonts.body,
          transition: 'background .12s, color .12s',
          textAlign: 'left',
          whiteSpace: 'nowrap',
          minHeight: mobile ? (indent ? 44 : 48) : (indent ? 36 : 40),
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.color = '#fff'
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = item.isBack ? 'rgba(255,255,255,0.65)' : indent ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.88)'
          }
        }}
      >
        {/* Active indicator bar */}
        {isActive && (
          <span style={{
            position: 'absolute',
            left: -6,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 3,
            height: 24,
            background: colors.luxeGold,
            borderRadius: '0 3px 3px 0',
          }} />
        )}
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', ...(indent ? { transform: 'scale(0.85)' } : {}) }}>
          {icon}
        </span>
        {(!collapsed || mobile) && (
          <span style={{ fontSize: indent ? 12.5 : 13 }}>{item.label}</span>
        )}
      </button>
    )
  }

  const sidebarContent = (
    <div
      data-testid="sidebar"
      style={{
        width: mobile ? 280 : collapsed ? 60 : 220,
        minWidth: mobile ? 280 : collapsed ? 60 : 220,
        height: '100%',
        background: colors.inkPlum,
        borderRight: `2px solid ${colors.lovelabDark}`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width .2s, min-width .2s',
        overflowX: 'hidden',
        overflowY: 'auto',
        zIndex: mobile ? 300 : 10,
        fontFamily: fonts.body,
      }}
    >
      {/* Mobile close button — no logo here since it lives in TopNav */}
      {mobile && (
        <div style={{ padding: '12px 16px', borderBottom: 'rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.65)', padding: 4, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {items.flatMap((item) => {
          // Collapsed desktop mode flattens groups so every page keeps an
          // icon; group headers would be dead weight without labels.
          if (item.children && collapsed && !mobile) {
            return item.children.map((child) => renderLeaf(child))
          }
          if (item.children) {
            const isOpenGroup = openGroups.has(item.id)
            const hasActiveChild = item.children.some((child) => child.id === activeId)
            const groupIcon = ICONS[item.id] || ICONS.home
            return [
              <button
                key={item.id}
                data-testid={`sidebar-group-${item.id}`}
                onClick={() => toggleGroup(item.id)}
                aria-expanded={isOpenGroup}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 16px',
                  border: 'none',
                  borderRadius: 8,
                  margin: '1px 6px',
                  width: 'calc(100% - 12px)',
                  background: 'transparent',
                  color: hasActiveChild ? '#fff' : 'rgba(255,255,255,0.88)',
                  fontWeight: hasActiveChild ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                  transition: 'background .12s, color .12s',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                  minHeight: mobile ? 48 : 40,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = hasActiveChild ? '#fff' : 'rgba(255,255,255,0.88)' }}
              >
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  {groupIcon}
                </span>
                <span style={{ fontSize: 13, flex: 1 }}>{item.label}</span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: isOpenGroup ? 'rotate(90deg)' : 'none', transition: 'transform .15s', opacity: 0.7, flexShrink: 0 }}
                >
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>,
              ...(isOpenGroup ? item.children.map((child) => renderLeaf(child, true)) : []),
            ]
          }
          return [renderLeaf(item)]
        })}
      </nav>

      {/* Collapse toggle — desktop only */}
      {!mobile && onToggleCollapse && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '8px 0', flexShrink: 0 }}>
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            data-testid="sidebar-collapse-toggle"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-end',
              gap: 8,
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.45)',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: fonts.body,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
          >
            {!collapsed && <span style={{ fontSize: 11, fontWeight: 600 }}>Collapse</span>}
            <CollapseIcon collapsed={collapsed} />
          </button>
        </div>
      )}
    </div>
  )

  // ─── Mobile: fixed drawer with backdrop ─────────────────────────────────
  if (mobile) {
    return (
      <>
        {/* Backdrop */}
        {isOpen && (
          <div
            data-testid="sidebar-backdrop"
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 299,
            }}
          />
        )}
        {/* Drawer */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            height: '100%',
            transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
            zIndex: 300,
            boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.18)' : 'none',
          }}
        >
          {sidebarContent}
        </div>
      </>
    )
  }

  // ─── Desktop: static column ──────────────────────────────────────────────
  return sidebarContent
}

export default memo(Sidebar)
