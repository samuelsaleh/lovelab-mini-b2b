'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { colors, fonts } from '@/lib/styles'
import Sidebar from './Sidebar'
import UserMenu from './UserMenu'

/**
 * Shared portal layout used by both AdminLayout and AgentLayout.
 *
 * Props:
 *   navItems    — array of nav items (ADMIN_NAV_ITEMS or AGENT_NAV_ITEMS)
 *   activeId    — currently active nav item id
 *   portalLabel — badge label shown next to the logo (e.g. "Admin", "Agent Portal")
 *   rootPath    — the root path for this portal; back button hides when pathname === rootPath
 *   children    — page content
 */
export default function PortalLayout({ navItems, activeId, portalLabel, rootPath, children }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile } = useAuth()

  const [isMobile, setIsMobile] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  const canGoBack = pathname !== rootPath

  return (
    <div style={{ fontFamily: fonts.body, background: '#f8f8f8', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Slim top bar — same purple as sidebar */}
      <div style={{ background: colors.inkPlum, flexShrink: 0, zIndex: 100, borderBottom: `2px solid ${colors.lovelabDark}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '6px 12px' : '6px 20px', width: '100%', boxSizing: 'border-box',
        }}>
          {/* Left: hamburger (mobile) + logo + badge + optional back */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, minWidth: 0 }}>
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
                data-testid="open-sidebar"
                style={{
                  background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.35)',
                  borderRadius: 8, padding: 8, color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
            )}
            <img
              src="/logo.png"
              alt="LoveLab"
              style={{ height: isMobile ? 80 : 128, marginTop: isMobile ? -20 : -32, marginBottom: isMobile ? -20 : -32, filter: 'brightness(0) invert(1)' }}
            />
            {!isMobile && (
              <span style={{
                fontSize: 12, fontWeight: 700, color: '#fff',
                background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: 6,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {portalLabel}
              </span>
            )}
            {canGoBack && !isMobile && (
              <button
                onClick={() => router.back()}
                aria-label="Go back"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'rgba(255,255,255,0.12)', color: '#fff',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/>
                  <polyline points="12 19 5 12 12 5"/>
                </svg>
                Back
              </button>
            )}
          </div>

          {/* Right: user display + UserMenu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isMobile && (
              <div style={{
                fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600,
                padding: '4px 10px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)',
              }}>
                {profile?.full_name || user?.email}
              </div>
            )}
            <UserMenu />
          </div>
        </div>
      </div>

      {/* Two-column body (sidebar becomes drawer on mobile) */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <Sidebar
          items={navItems}
          activeId={activeId}
          onSelect={() => {}}
          mobile={isMobile}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
