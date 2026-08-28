'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import CertShell from '../components/certificates/CertShell'
import { IGI_NAV_ITEMS } from '@/lib/navItems'
import '../certificates/certificates.css'

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
 *
 * They get the same chrome as the certificate application, because it is the
 * same application seen from the other side of the road. There is no way out
 * in the sidebar: IGI are another company and have nowhere in this app to go.
 */
export default function IgiLayout({ children }) {
  const router = useRouter()
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (!loading && (!user || !profile?.is_igi)) {
      router.push('/')
    }
  }, [loading, user, profile, router])

  if (loading) {
    return <div className="certapp"><div className="loading">Loading</div></div>
  }

  if (!user || !profile?.is_igi) return null

  return (
    <>
      {/* IBM Plex, loaded only here. IGI keep the blue prototype look, and no
          other screen in the app uses these faces. */}
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@600&display=swap"
        rel="stylesheet"
      />
      <CertShell
        nav={IGI_NAV_ITEMS}
        home="/igi"
        brand="IGI Antwerp"
        title="LoveLab certificates"
        banner="what LoveLab are waiting on"
        status="IGI portal"
        exit={null}
      >
        {children}
      </CertShell>
    </>
  )
}
