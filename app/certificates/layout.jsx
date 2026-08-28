'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import CertShell from '../components/certificates/CertShell'
import { CERTIFICATE_NAV } from '@/lib/navItems'
import './certificates.css'

/**
 * The way into the certificate application.
 *
 * LoveLab admins only. IGI have their own entrance at /igi and are refused
 * everywhere else by the request interceptor in lib/supabase/middleware.js;
 * this guard is the second of the two, not the only one.
 */
export default function CertificatesLayout({ children }) {
  const router = useRouter()
  const { user, profile, loading } = useAuth()

  const allowed = Boolean(user) && profile?.role === 'admin'

  useEffect(() => {
    if (!loading && !allowed) router.push('/')
  }, [loading, allowed, router])

  if (loading) {
    return <div className="certapp lovelab"><div className="loading">Loading</div></div>
  }

  if (!allowed) return null

  return (
    <>
      {/* Cormorant Garamond is LoveLab's display face, per their brand book.
          Montserrat already comes from the root layout. Loading it here rather
          than globally keeps it off every other screen in the app. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&display=swap"
        rel="stylesheet"
      />
      <CertShell
        nav={CERTIFICATE_NAV}
        home="/certificates"
        theme="lovelab"
        brand="LoveLab"
        title="Certificates"
        banner="every IGI movement, held once"
        status="LoveLab Antwerp"
        exit={{ href: '/admin', label: '← Back to LoveLab' }}
      >
        {children}
      </CertShell>
    </>
  )
}
