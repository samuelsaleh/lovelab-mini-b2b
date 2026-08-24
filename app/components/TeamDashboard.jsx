'use client'

/**
 * TeamDashboard — shared accumulated team view for an organization.
 *
 * Used by /agent/team: every org member sees it; owners get management
 * controls. Everyone inside the org sees the SAME data (KPIs, per-member
 * revenue, revenue by fair). Management (invite / resend / pause / remove)
 * renders only for owners and admins — the API enforces the same rule
 * server-side.
 *
 * /admin/organizations/[id] no longer renders this component: that page has
 * its own single members table and reuses only TeamInviteForm and
 * RevenueByFairChart, both extracted from here.
 *
 * Props:
 *   organizationId — required
 *   adminView      — admin extras (invite owners, link to agent detail pages)
 */

import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { colors } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'
import { useResponsive } from '@/lib/useIsMobile'
import TeamInviteForm from './TeamInviteForm'
import RevenueByFairChart from './RevenueByFairChart'
import { isHideRevenue } from '@/lib/utils'

const fmt = (n) => {
  if (isHideRevenue() || n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const sectionLabel = { fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }

export default function TeamDashboard({ organizationId, adminView = false }) {
  const { t } = useI18n()
  const { isCompact } = useResponsive()

  const [stats, setStats] = useState(null)
  const [members, setMembers] = useState([])
  const [callerRole, setCallerRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Row-level busy flag (pause / resend / remove)
  const [busyUserId, setBusyUserId] = useState(null)

  const canManage = adminView || callerRole === 'admin' || callerRole === 'owner'

  const loadData = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    setError(null)
    try {
      const [statsRes, membersRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/stats`),
        fetch(`/api/organizations/${organizationId}/members`),
      ])
      if (!statsRes.ok || !membersRes.ok) throw new Error('load_failed')
      const statsData = await statsRes.json()
      const membersData = await membersRes.json()
      setStats(statsData)
      setMembers(membersData.members || [])
      setCallerRole(membersData.caller_role || null)
    } catch {
      setError(t('team.loadError'))
    }
    setLoading(false)
  }, [organizationId, t])

  useEffect(() => { loadData() }, [loadData])

  const memberAction = async (userId, action) => {
    setBusyUserId(userId)
    try {
      let res
      if (action === 'remove') {
        res = await fetch(`/api/organizations/${organizationId}/members/${userId}`, { method: 'DELETE' })
      } else {
        res = await fetch(`/api/organizations/${organizationId}/members/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
      }
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || t('team.actionFailed'))
      } else if (action === 'resend_invite') {
        alert(t('team.inviteResent'))
      }
      await loadData()
    } catch {
      alert(t('team.actionFailed'))
    }
    setBusyUserId(null)
  }

  const handleRemove = (member) => {
    const name = member.profiles?.full_name || member.profiles?.email || ''
    if (!window.confirm(t('team.confirmRemove', { name }))) return
    memberAction(member.user_id, 'remove')
  }

  if (!organizationId) return null

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: colors.lovelabMuted, fontSize: 13 }}>
        {t('team.loading')}
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 14, margin: 16, background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {error}
        <button onClick={loadData} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          {t('team.retry')}
        </button>
      </div>
    )
  }

  const totals = stats?.totals || {}
  const perMember = stats?.per_member || []
  const statsByUserId = new Map(perMember.map((m) => [m.user_id, m]))
  const removedWithActivity = perMember.filter((m) => m.is_removed)

  return (
    <div>
      {/* KPI cards */}
      <div data-testid="team-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label={t('team.kpi.revenue')} value={fmt(totals.revenue || 0)} sub={`${totals.orders || 0} ${t('team.orders')} · ${totals.quotes || 0} ${t('team.quotes')}`} accent={colors.inkPlum} />
        <Kpi label={t('team.kpi.orders')} value={totals.orders || 0} sub={t('team.kpi.ordersSub')} accent={colors.luxeGold} />
        <Kpi label={t('team.kpi.activeMembers')} value={totals.active_members || 0} sub={t('team.kpi.activeMembersSub')} accent={colors.success} />
        <Kpi label={t('team.kpi.pendingCommission')} value={fmt(totals.pending_commission || 0)} sub={t('team.kpi.pendingCommissionSub', { total: fmt(totals.total_commission || 0) })} accent={colors.warning} />
      </div>

      {/* Invite form — owners and admins only */}
      {canManage && (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '16px 18px', marginBottom: 20 }}>
          <TeamInviteForm organizationId={organizationId} adminView={adminView} onInvited={loadData} />
        </div>
      )}

      {/* Members table */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${colors.lineGray}` }}>
          <span style={sectionLabel}>{t('team.membersTitle')} ({members.length})</span>
        </div>
        {members.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>{t('team.noMembers')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.lineGray}` }}>
                  <th style={th}>{t('team.col.member')}</th>
                  <th style={th}>{t('team.col.role')}</th>
                  <th style={th}>{t('team.col.status')}</th>
                  <th style={{ ...th, textAlign: 'right' }}>{t('team.col.revenue')}</th>
                  <th style={{ ...th, textAlign: 'right' }}>{t('team.col.orders')}</th>
                  <th style={{ ...th, textAlign: 'right' }}>{t('team.col.commission')}</th>
                  {canManage && <th style={{ ...th, textAlign: 'right' }}>{t('team.col.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const p = m.profiles || {}
                  const s = statsByUserId.get(m.user_id) || {}
                  const status = p.agent_status || 'active'
                  const isBusy = busyUserId === m.user_id
                  const canActOnRow = canManage && (adminView || callerRole === 'admin' || m.role !== 'owner')
                  return (
                    <tr key={m.user_id} data-testid={`team-member-row-${m.user_id}`} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.role === 'owner' ? colors.luxeGold : colors.inkPlum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                            {(p.full_name || p.email || '?')[0].toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            {adminView ? (
                              <a href={`/admin/agents/${m.user_id}`} style={{ fontSize: 13, fontWeight: 600, color: colors.inkPlum, textDecoration: 'none' }}>
                                {p.full_name || p.email}
                              </a>
                            ) : (
                              <div style={{ fontSize: 13, fontWeight: 600, color: colors.charcoal }}>{p.full_name || p.email}</div>
                            )}
                            <div style={{ fontSize: 11, color: colors.lovelabMuted }}>{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={td}>
                        <RoleBadge role={m.role} t={t} />
                      </td>
                      <td style={td}>
                        <StatusBadge status={status} t={t} />
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: colors.inkPlum }}>{fmt(s.revenue || 0)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{s.orders || 0}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmt(s.commission || 0)}</td>
                      {canManage && (
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {canActOnRow && (
                            <span style={{ display: 'inline-flex', gap: 6 }}>
                              {status === 'invited' && !p.has_password_set && (
                                <ActionBtn disabled={isBusy} onClick={() => memberAction(m.user_id, 'resend_invite')}>
                                  {t('team.actions.resend')}
                                </ActionBtn>
                              )}
                              {status === 'paused' ? (
                                <ActionBtn disabled={isBusy} onClick={() => memberAction(m.user_id, 'reactivate')}>
                                  {t('team.actions.reactivate')}
                                </ActionBtn>
                              ) : (
                                <ActionBtn disabled={isBusy} onClick={() => memberAction(m.user_id, 'pause')}>
                                  {t('team.actions.pause')}
                                </ActionBtn>
                              )}
                              <ActionBtn danger disabled={isBusy} onClick={() => handleRemove(m)}>
                                {t('team.actions.remove')}
                              </ActionBtn>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {removedWithActivity.length > 0 && (
          <div style={{ padding: '10px 18px', fontSize: 11, color: colors.lovelabMuted, borderTop: `1px solid ${colors.borderLight}` }}>
            {t('team.removedNote', { count: removedWithActivity.length })}
          </div>
        )}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 20 }}>
        {/* Revenue by member */}
        <div data-testid="team-revenue-by-member" style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '16px 18px' }}>
          <div style={{ ...sectionLabel, marginBottom: 14 }}>{t('team.revenueByMember')}</div>
          {perMember.filter((m) => m.revenue > 0).length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>{t('team.noData')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(120, perMember.filter((m) => m.revenue > 0).length * 42)}>
              <BarChart data={perMember.filter((m) => m.revenue > 0).map((m) => ({ name: m.full_name || m.email || '—', revenue: m.revenue }))} layout="vertical" barCategoryGap="24%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} tickFormatter={(v) => (isHideRevenue() ? '—' : `€${v >= 1000 ? Math.round(v / 1000) + 'k' : v}`)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} width={120} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="revenue" name={t('team.col.revenue')} fill={colors.inkPlum} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue by fair/event */}
        <RevenueByFairChart data={stats?.revenue_by_event} />
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent || colors.inkPlum, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.lovelabMuted }}>{sub}</div>
    </div>
  )
}

function RoleBadge({ role, t }) {
  const isOwner = role === 'owner'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.04em',
      background: isOwner ? '#fdf6e3' : '#f3f0f4', color: isOwner ? colors.luxeGold : colors.inkPlum,
      border: `1px solid ${isOwner ? '#f0e2bd' : colors.lovelabBorder}`,
    }}>
      {isOwner ? t('team.role.owner') : t('team.role.member')}
    </span>
  )
}

function StatusBadge({ status, t }) {
  const map = {
    active: { bg: '#f0fdf4', color: '#15803d', label: t('team.status.active') },
    invited: { bg: '#eff6ff', color: '#1d4ed8', label: t('team.status.invited') },
    paused: { bg: '#fff7ed', color: '#c2410c', label: t('team.status.paused') },
    inactive: { bg: '#f3f4f6', color: '#6b7280', label: t('team.status.inactive') },
  }
  const s = map[status] || map.active
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function ActionBtn({ children, onClick, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
        border: `1px solid ${danger ? '#fecaca' : colors.border}`,
        background: danger ? '#fef2f2' : '#fff',
        color: danger ? '#dc2626' : colors.charcoal,
      }}
    >
      {children}
    </button>
  )
}

const th = { padding: '10px 18px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }
const td = { padding: '10px 18px', verticalAlign: 'middle' }
