'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { fonts, colors } from '@/lib/styles'
import PortalLayout from '../components/PortalLayout'
import { ADMIN_NAV_ITEMS } from '@/lib/navItems'

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

  const activeId =
    pathname === '/admin'                          ? 'dashboard'
    : pathname.startsWith('/admin/agents')         ? 'agents'
    : pathname.startsWith('/admin/fairs')          ? 'fairs'
    : pathname.startsWith('/admin/consignment')    ? 'consignment'
    : pathname.startsWith('/analytics')            ? 'analytics'
    : pathname.startsWith('/admin/reports')        ? 'reports'
    : 'dashboard'

  return (
    <PortalLayout
      navItems={ADMIN_NAV_ITEMS}
      activeId={activeId}
      portalLabel="Admin"
      rootPath="/admin"
    >
      {children}
    </PortalLayout>
  )
}
