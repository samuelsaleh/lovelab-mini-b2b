'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { colors, fonts } from '@/lib/styles'
import Sidebar from '../components/Sidebar'
import { ADMIN_NAV_ITEMS } from '@/lib/navItems'
import UserMenu from '../components/UserMenu'

export default function AdminLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (!loading && (!user || profile?.role !== 'admin')) {
      router.push('/')
    }
  }, [loading, user, profile, router])

  if (loading) {
    return (
      <div style={{ fontFamily: fonts.body, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading...
      </div>
    )
  }

  if (!user || profile?.role !== 'admin') return null

  // Determine active sidebar item from current path
  const activeId =
    pathname === '/admin' ? 'dashboard'
    : pathname.startsWith('/admin/agents') ? 'agents'
    : pathname.startsWith('/admin/fairs') ? 'fairs'
    : pathname.startsWith('/admin/clients') ? 'clients'
    : 'dashboard'

  const canGoBack = pathname !== '/admin'

  return (
    <div style={{ fontFamily: fonts.body, background: '#f8f8f8', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Slim top bar */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${colors.lineGray}`, flexShrink: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="LoveLab" style={{ height: 44 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum, background: '#efe7f2', padding: '3px 10px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Admin
            </span>
            {canGoBack && (
              <button
                onClick={() => router.back()}
                aria-label="Go back"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${colors.lineGray}`,
                  background: '#fff',
                  color: colors.charcoal,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.color = colors.inkPlum }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.lineGray; e.currentTarget.style.color = colors.charcoal }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/>
                  <polyline points="12 19 5 12 12 5"/>
                </svg>
                Back
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                fontSize: 11, color: '#666',
                padding: '4px 10px', borderRadius: 8,
                border: '1px solid #ece7ef', background: '#faf8fc',
              }}
            >
              {profile?.full_name || user?.email}
            </div>
            <UserMenu />
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <Sidebar
          items={ADMIN_NAV_ITEMS}
          activeId={activeId}
          onSelect={() => {}}
        />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
