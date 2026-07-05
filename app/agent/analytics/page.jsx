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

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import AnalyticsDashboard from '@/app/components/AnalyticsDashboard'
import { useAuth } from '@/app/components/AuthProvider'
import { useI18n } from '@/lib/i18n'
import { colors, fonts } from '@/lib/styles'

function AgentAnalyticsInner() {
  const searchParams = useSearchParams()
  const initialEventId = searchParams.get('event') || null
  const { orgMembership } = useAuth()
  const { t } = useI18n()
  // For org members the API's default document list already includes the
  // whole team, so 'all' = team view. The toggle lets them narrow to their
  // own documents (scope=mine).
  const [scope, setScope] = useState('all')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {orgMembership && (
        <div style={{ display: 'flex', gap: 6, padding: '14px 20px 0' }}>
          <ScopePill active={scope === 'all'} onClick={() => setScope('all')}>
            {t('team.analyticsTeamData')}
          </ScopePill>
          <ScopePill active={scope === 'mine'} onClick={() => setScope('mine')}>
            {t('team.analyticsMyData')}
          </ScopePill>
        </div>
      )}
      <AnalyticsDashboard key={scope} initialEventId={initialEventId} dataScope={scope === 'mine' ? 'mine' : 'all'} />
    </div>
  )
}

function ScopePill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 16px', borderRadius: 18, border: 'none',
        background: active ? colors.inkPlum : '#eee',
        color: active ? '#fff' : '#555',
        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        transition: 'all .15s',
      }}
    >
      {children}
    </button>
  )
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
