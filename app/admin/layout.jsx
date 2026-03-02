'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { colors, fonts } from '@/lib/styles'

const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin' },
  { id: 'agents', label: 'Agents', href: '/admin/agents' },
  { id: 'fairs', label: 'Fairs', href: '/admin/fairs' },
  { id: 'clients', label: 'Clients', href: '/admin/clients' },
]

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

  const activeTab = ADMIN_TABS.find(t => t.href === pathname)?.id
    || (pathname.startsWith('/admin/agents') ? 'agents' : null)
    || (pathname.startsWith('/admin/fairs') ? 'fairs' : null)
    || (pathname.startsWith('/admin/clients') ? 'clients' : null)
    || 'dashboard'

  return (
    <div style={{ fontFamily: fonts.body, background: '#f8f8f8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Admin Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${colors.lineGray}`, flexShrink: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="LoveLab" style={{ height: 48 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, background: '#efe7f2', padding: '3px 10px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Admin
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => router.push('/')}
              style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${colors.inkPlum}`, background: '#fdf7fa', color: colors.inkPlum, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Back to App
            </button>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: colors.inkPlum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
              {(profile?.full_name || user?.email || '?')[0].toUpperCase()}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, padding: '0 20px', maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          {ADMIN_TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => router.push(tab.href)}
                style={{
                  padding: '12px 20px', border: 'none',
                  borderBottom: isActive ? `2.5px solid ${colors.inkPlum}` : '2.5px solid transparent',
                  background: 'transparent', color: isActive ? colors.inkPlum : '#888',
                  fontSize: 13, fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer', fontFamily: fonts.body, whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </main>
    </div>
  )
}
