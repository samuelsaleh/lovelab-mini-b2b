'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { fonts, colors } from '@/lib/styles'
import PortalLayout from '../components/PortalLayout'
import { IGI_NAV_ITEMS, resolveIgiActiveId } from '@/lib/navItems'

/**
 * IGI Antwerp's own way in.
 *
 * Only an IGI account reaches this, and an IGI account reaches nothing else —
 * the request interceptor in lib/supabase/middleware.js refuses them everywhere
 * outside /igi. This guard is the second of the two, not the only one.
 *
 * An admin is deliberately not admitted here either: the two roles stay
 * disjoint, so nobody is looking at IGI's screens while holding LoveLab's
 * session.
 */
export default function IgiLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (!loading && (!user || !profile?.is_igi)) {
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

  if (!user || !profile?.is_igi) return null

  return (
    <PortalLayout
      navItems={IGI_NAV_ITEMS}
      activeId={resolveIgiActiveId(pathname)}
      portalLabel="IGI"
      rootPath="/igi"
    >
      {children}
    </PortalLayout>
  )
}
