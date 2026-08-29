'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import CertShell from '../components/certificates/CertShell'
import { IgiPortalProvider } from '../components/certificates/IgiPortalContext'
import { IGI_NAV_ITEMS } from '@/lib/navItems'
import '../certificates/certificates.css'

/**
 * IGI Antwerp's own way in — and LoveLab's way of looking over their shoulder.
 *
 * Two kinds of account reach this, and they are not the same visit:
 *
 *   An IGI account. Their portal, their data, their buttons. The request
 *   interceptor in lib/supabase/middleware.js refuses them everywhere outside
 *   /igi; this guard is the second of the two, not the only one.
 *
 *   A LoveLab admin, in preview. Sam needs to see what he is asking of another
 *   company — both before handing over a login and afterwards, when IGI ring up
 *   about something on their screen. Reading it is fair. Typing on their behalf
 *   is not: the record is only worth something to both sides while each side
 *   enters its own half, so every write control is disabled and the preview API
 *   has no write route to call even if one slipped through.
 *
 * Nobody else gets in at all.
 */
export default function IgiLayout({ children }) {
  const router = useRouter()
  const { user, profile, loading } = useAuth()

  const isIgi = Boolean(profile?.is_igi)
  const isAdmin = profile?.role === 'admin'
  const allowed = Boolean(user) && (isIgi || isAdmin)

  useEffect(() => {
    if (!loading && !allowed) router.push('/')
  }, [loading, allowed, router])

  if (loading) {
    return <div className="certapp"><div className="loading">Loading</div></div>
  }

  if (!allowed) return null

  // An IGI account always sees their own portal, even if they somehow also held
  // the admin flag: the narrower role wins, so nobody is ever shown a preview
  // of a screen that is actually theirs.
  const preview = !isIgi

  return (
    <IgiPortalProvider
      base={preview ? '/api/igi/preview' : '/api/igi-portal'}
      readOnly={preview}
    >
      <CertShell
        nav={IGI_NAV_ITEMS}
        home="/igi"
        brand="IGI Antwerp"
        mark="/igi-logo.png"
        title="LoveLab certificates"
        banner={preview
          ? 'preview — IGI’s screens exactly as they see them, read only'
          : 'what LoveLab are waiting on'}
        status={preview ? 'Viewing as LoveLab' : 'IGI portal'}
        exit={preview ? { href: '/certificates', label: '← Back to certificates' } : null}
      >
        {children}
      </CertShell>
    </IgiPortalProvider>
  )
}
