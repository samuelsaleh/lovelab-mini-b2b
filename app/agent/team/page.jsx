'use client'

/**
 * Agent Portal — Team page.
 *
 * Every active member of an organization sees the same accumulated team
 * dashboard here (KPIs, per-member revenue, revenue by fair, members list).
 * Owners additionally get the invite form and member management actions —
 * this is how a partner company's main agent self-onboards her sub-agents
 * without any LoveLab admin involvement.
 *
 * Agents without an organization are redirected back to their dashboard
 * (in practice every agent has an auto-created org, so this is a safety net).
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthProvider'
import TeamDashboard from '@/app/components/TeamDashboard'
import { colors, fonts } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'

export default function AgentTeamPage() {
  const router = useRouter()
  const { orgMembership, loading } = useAuth()
  const { t } = useI18n()

  useEffect(() => {
    if (!loading && !orgMembership) {
      router.replace('/agent')
    }
  }, [loading, orgMembership, router])

  if (loading || !orgMembership) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted, fontFamily: fonts.body }}>
        {t('team.loading')}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>
            {t('team.title')}
          </h1>
          <div style={{ fontSize: 13, color: colors.lovelabMuted, marginTop: 4 }}>
            {orgMembership.organization_name || t('team.subtitle')}
          </div>
        </div>
        <TeamDashboard organizationId={orgMembership.organization_id} />
      </div>
    </div>
  )
}
