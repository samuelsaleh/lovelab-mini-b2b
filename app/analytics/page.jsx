'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { colors, fonts } from '@/lib/styles'

/** Analytics has moved into role-specific portals. Redirect based on role. */
export default function AnalyticsRedirect() {
  const router = useRouter()
  const { profile, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (profile?.role === 'admin') {
      router.replace('/admin/reports')
    } else if (profile?.is_agent) {
      router.replace('/agent/reports')
    } else {
      router.replace('/')
    }
  }, [loading, profile, router])

  return (
    <div style={{ fontFamily: fonts.body, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
      Redirecting…
    </div>
  )
}
