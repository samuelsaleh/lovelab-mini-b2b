'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AnalyticsDashboard from '@/app/components/AnalyticsDashboard'
import { colors, fonts } from '@/lib/styles'

function AnalyticsPage() {
  const searchParams = useSearchParams()
  const initialEventId = searchParams.get('event') || null
  return <AnalyticsDashboard initialEventId={initialEventId} />
}

export default function Analytics() {
  return (
    <Suspense fallback={
      <div style={{ fontFamily: fonts.body, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading Analytics...
      </div>
    }>
      <AnalyticsPage />
    </Suspense>
  )
}
