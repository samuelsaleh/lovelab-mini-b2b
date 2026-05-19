'use client'

/**
 * Agent Analytics
 *
 * Reuses the same AnalyticsDashboard the admin sees, scoped to the
 * agent's own data via RLS (the underlying /api/documents and /api/events
 * endpoints already filter by `created_by` for non-admins). This gives
 * agents charts + filters that are genuinely different from the
 * Dashboard (KPIs/commissions table) and Reports (downloadable monthly
 * PDFs).
 *
 * If we ever want a leaner, agent-specific analytics view (e.g. focused
 * on commissions earned over time rather than total revenue), this is
 * the file to swap. For now reuse keeps parity with admin.
 */

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AnalyticsDashboard from '@/app/components/AnalyticsDashboard'
import { colors, fonts } from '@/lib/styles'

function AgentAnalyticsInner() {
  const searchParams = useSearchParams()
  const initialEventId = searchParams.get('event') || null
  return <AnalyticsDashboard initialEventId={initialEventId} />
}

export default function AgentAnalyticsPage() {
  return (
    <Suspense fallback={
      <div style={{ fontFamily: fonts.body, minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading Analytics...
      </div>
    }>
      <AgentAnalyticsInner />
    </Suspense>
  )
}
