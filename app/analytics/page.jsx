'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { colors, fonts } from '@/lib/styles'

/**
 * /analytics has moved into role-specific portals (mirrors the /reports
 * migration). Admins go to /admin/reports, agents to /agent/reports, and
 * everyone else is bounced to the home page. The legacy AnalyticsDashboard
 * component is still rendered by both /admin/reports and /agent/reports.
 */
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
