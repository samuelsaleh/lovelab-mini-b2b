'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { fonts, colors } from '@/lib/styles'
import PortalLayout from '../components/PortalLayout'
import { getAgentNavItems, resolveAgentActiveId } from '@/lib/navItems'

export default function AgentLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, orgMembership, loading } = useAuth()

  useEffect(() => {
    if (!loading && (!user || !profile?.is_agent)) {
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

  if (!user || !profile?.is_agent) return null

  const activeId = resolveAgentActiveId(pathname)

  return (
    <PortalLayout
      navItems={getAgentNavItems(orgMembership)}
      activeId={activeId}
      portalLabel="Agent Portal"
      rootPath="/agent"
    >
      {children}
    </PortalLayout>
  )
}
