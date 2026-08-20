'use client'

/**
 * Admin — Partner Team detail.
 *
 * One members list, full stop. The single Members table carries everything
 * about a person: role, status, documents, revenue, rate, outstanding
 * commission and the management actions (resend invite / pause / remove).
 * Below it sit the two things no table shows: the Payments card (one report,
 * one payment through the owner) and the revenue-by-fair chart.
 *
 * TeamDashboard is intentionally NOT rendered here — it repeated the totals,
 * the members and the per-member revenue this page already shows, and its
 * extra /stats + /members fetches doubled the load time. /agent/team still
 * uses it in full; this page reuses only TeamInviteForm and RevenueByFairChart.
 *
 * Admin-only controls:
 *   - edit org settings (name, territory, commission rate, conditions)
 *   - invite members OR additional owners
 *   - pause/remove any member (including owners)
 *   - jump to each agent's /admin/agents/[id] detail page
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import OrgSettlementCard from '@/app/components/OrgSettlementCard'
import TeamInviteForm from '@/app/components/TeamInviteForm'
import RevenueByFairChart from '@/app/components/RevenueByFairChart'
import { colors } from '@/lib/styles'
import { resolveEffectiveRate } from '@/lib/effectiveRate'

const formatMoney = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(toNumber(value))

const toNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const firstNumber = (source, keys) => {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null) return toNumber(source[key])
  }
  return 0
}

const formatCount = (value) => new Intl.NumberFormat('en-US').format(toNumber(value))

export default function AdminOrganizationDetailPage() {
  const { id: organizationId } = useParams()
  const router = useRouter()

  const [organization, setOrganization] = useState(null)
  const [members, setMembers] = useState([])
  const [ledger, setLedger] = useState(null)
  const [stats, setStats] = useState(null)
  const [agentsById, setAgentsById] = useState(new Map())
  const [summaryError, setSummaryError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Settings editing
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', territory: '', commission_rate: '', conditions: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Member management (resend invite / pause / remove)
  const [busyUserId, setBusyUserId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSummaryError(null)
    try {
      const [orgRes, membersRes, ledgerRes, statsRes, agentsRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}`),
        fetch(`/api/organizations/${organizationId}/members`),
        fetch(`/api/organizations/${organizationId}/ledger`),
        fetch(`/api/organizations/${organizationId}/stats`),
        fetch('/api/agents'),
      ])
      const [data, membersData, ledgerData, statsData, agentsData] = await Promise.all([
        orgRes.json().catch(() => ({})),
        membersRes.json().catch(() => ({})),
        ledgerRes.json().catch(() => ({})),
        statsRes.json().catch(() => ({})),
        agentsRes.json().catch(() => ({})),
      ])
      if (!orgRes.ok) throw new Error(data.error || 'load_failed')

      const auxiliaryFailures = []
      if (!membersRes.ok) auxiliaryFailures.push('members')
      if (!ledgerRes.ok) auxiliaryFailures.push('team totals')
      if (!statsRes.ok) auxiliaryFailures.push('documents and revenue')
      if (!agentsRes.ok) auxiliaryFailures.push('member rates')
      if (auxiliaryFailures.length > 0) {
        setSummaryError(`Some organization details could not be loaded: ${auxiliaryFailures.join(', ')}.`)
      }

      setOrganization(data.organization)
      setMembers(membersRes.ok ? (membersData.members || []) : [])
      setLedger(ledgerRes.ok ? ledgerData : null)
      setStats(statsRes.ok ? statsData : null)
      setAgentsById(new Map(
        (agentsRes.ok ? (agentsData.agents || []) : []).map((agent) => [agent.id, agent]),
      ))
      setForm({
        name: data.organization?.name || '',
        territory: data.organization?.territory || '',
        commission_rate: data.organization?.commission_rate ?? '',
        conditions: data.organization?.conditions || '',
      })
    } catch (e) {
      setError(e.message === 'load_failed' ? 'Failed to load organization.' : e.message)
    }
    setLoading(false)
  }, [organizationId])

  useEffect(() => { if (organizationId) load() }, [organizationId, load])

  const saveSettings = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        name: form.name,
        territory: form.territory || null,
        commission_rate: form.commission_rate === '' ? null : Number(form.commission_rate),
        conditions: form.conditions || null,
      }
      const res = await fetch(`/api/organizations/${organizationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setOrganization(data.organization)
      setForm({
        name: data.organization?.name || '',
        territory: data.organization?.territory || '',
        commission_rate: data.organization?.commission_rate ?? '',
        conditions: data.organization?.conditions || '',
      })
      setEditing(false)
    } catch (e) {
      setSaveError(e.message)
    }
    setSaving(false)
  }

  const memberAction = async (userId, action) => {
    setBusyUserId(userId)
    try {
      const url = `/api/organizations/${organizationId}/members/${userId}`
      const res = action === 'remove'
        ? await fetch(url, { method: 'DELETE' })
        : await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Action failed. Please try again.')
      } else if (action === 'resend_invite') {
        alert('Invitation re-sent.')
      }
      await load()
    } catch {
      alert('Action failed. Please try again.')
    }
    setBusyUserId(null)
  }

  const handleRemove = (member) => {
    const profile = member.profiles || member.profile || {}
    const name = profile.full_name || profile.email || 'this member'
    if (!window.confirm(`Remove ${name} from the organization?`)) return
    memberAction(member.user_id, 'remove')
  }

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>Loading organization...</div>
  }

  if (error || !organization) {
    return (
      <div style={{ flex: 1, padding: 32 }}>
        <div style={{ padding: 14, background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
          {error || 'Organization not found.'}
        </div>
      </div>
    )
  }

  const memberCount = members.length
  const summary = ledger?.organization_summary || {}
  const perMember = ledger?.per_member || []
  const ledgerByUserId = new Map(perMember.map((member) => [member.user_id, member]))
  const teamEarned = firstNumber(summary, ['total_commission_earned', 'team_earned', 'total_earned', 'earned'])
  const paidOut = firstNumber(summary, ['total_paid_out', 'paid_out', 'settled_amount', 'paid'])
  const outstanding = firstNumber(summary, ['pending_balance', 'outstanding', 'outstanding_balance', 'owed'])

  // Documents and revenue come from /stats, not from the ledger. A team whose
  // members all sit on a 0% rate earns no commission, so the money cards read
  // zero while the team is in fact selling — these two cards are what makes
  // that situation readable instead of looking like an empty organization.
  const totals = stats?.totals || {}
  const teamOrders = toNumber(totals.orders)
  const teamQuotes = toNumber(totals.quotes)
  const teamDocuments = teamOrders + teamQuotes
  const teamRevenue = toNumber(totals.revenue)
  const statsByUserId = new Map((stats?.per_member || []).map((entry) => [entry.user_id, entry]))
  const memberActivity = (userId) => {
    const entry = statsByUserId.get(userId) || {}
    const orders = toNumber(entry.orders)
    const quotes = toNumber(entry.quotes)
    return { orders, quotes, documents: orders + quotes, revenue: toNumber(entry.revenue) }
  }
  const sortedMembers = [...members].sort((a, b) => {
    const left = memberActivity(a.user_id)
    const right = memberActivity(b.user_id)
    if (right.revenue !== left.revenue) return right.revenue - left.revenue
    if (right.documents !== left.documents) return right.documents - left.documents
    if ((a.role === 'owner') !== (b.role === 'owner')) return a.role === 'owner' ? -1 : 1
    const nameA = (a.profiles || a.profile || {}).full_name || (a.profiles || a.profile || {}).email || ''
    const nameB = (b.profiles || b.profile || {}).full_name || (b.profiles || b.profile || {}).email || ''
    return nameA.localeCompare(nameB)
  })

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '26px 20px 48px', background: colors.lovelabBg }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 12 }}>
          <button
            onClick={() => router.push('/admin/organizations')}
            style={breadcrumbButton}
          >
            Organizations
          </button>
          <span aria-hidden="true" style={{ color: colors.lovelabBorder }}>/</span>
          <span aria-current="page" style={{ color: colors.charcoal, fontWeight: 600 }}>{organization.name}</span>
        </nav>

        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, marginBottom: 24, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 750, color: colors.inkPlum, margin: 0 }}>{organization.name}</h1>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 9, color: colors.lovelabMuted, fontSize: 13 }}>
              <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
              <span aria-hidden="true">·</span>
              <span>{organization.territory || 'No territory set'}</span>
            </div>
          </div>
        </header>

        {summaryError && (
          <div role="status" style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12 }}>
            {summaryError}
          </div>
        )}

        <section aria-labelledby="organization-settings-heading" style={{ ...cardStyle, padding: '20px 22px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <h2 id="organization-settings-heading" style={sectionHeading}>Organization settings</h2>
              <p style={sectionSubheading}>Shared defaults for this team.</p>
            </div>
            <button
              onClick={() => { setEditing(v => !v); setSaveError(null) }}
              aria-expanded={editing}
              style={secondaryButton}
            >
              {editing ? 'Cancel' : 'Edit settings'}
            </button>
          </div>

          {editing ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
                <Field label="Organization name">
                  <input aria-label="Organization name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                </Field>
                <Field label="Commission rate">
                  <div style={{ position: 'relative' }}>
                    <input aria-label="Commission rate" type="number" min="0" max="100" value={form.commission_rate} onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))} style={{ ...inputStyle, paddingRight: 34 }} />
                    <span aria-hidden="true" style={{ position: 'absolute', right: 12, top: 10, color: colors.lovelabMuted, fontSize: 13 }}>%</span>
                  </div>
                  <div style={helperText}>Default for members who don&apos;t have their own rate.</div>
                </Field>
                <Field label="Territory">
                  <input aria-label="Territory" value={form.territory} onChange={e => setForm(f => ({ ...f, territory: e.target.value }))} placeholder="e.g. France" style={inputStyle} />
                </Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <Field label="Conditions / notes">
                  <textarea aria-label="Conditions / notes" value={form.conditions} onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))} rows={2} style={{ ...inputStyle, height: 'auto', resize: 'vertical' }} />
                </Field>
              </div>
              {saveError && <div role="alert" style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{saveError}</div>}
              <button
                onClick={saveSettings}
                disabled={saving || !form.name.trim()}
                style={{ ...primaryButton, marginTop: 16, opacity: saving || !form.name.trim() ? 0.55 : 1 }}
              >
                {saving ? 'Saving...' : 'Save settings'}
              </button>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 18 }}>
              <div style={{ padding: '16px 18px', borderRadius: 10, background: '#fbf8fc', border: `1px solid ${colors.lovelabBorder}` }}>
                <div style={valueLabel}>Commission rate</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: colors.inkPlum, marginTop: 4 }}>
                  {firstNumber(organization, ['commission_rate', 'organization_rate', 'default_commission_rate'])}%
                </div>
                <div style={helperText}>Default for members who don&apos;t have their own rate.</div>
              </div>
              <div style={{ padding: '16px 18px' }}>
                <div style={valueLabel}>Territory</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: colors.charcoal, marginTop: 8 }}>{organization.territory || 'Not set'}</div>
              </div>
            </div>
          )}
        </section>

        <section aria-label="Team activity summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 14 }}>
          <SummaryCard
            label="Documents"
            value={formatCount(teamDocuments)}
            detail={`${formatCount(teamOrders)} ${teamOrders === 1 ? 'order' : 'orders'} · ${formatCount(teamQuotes)} ${teamQuotes === 1 ? 'quote' : 'quotes'}`}
          />
          <SummaryCard label="Team revenue" value={formatMoney(teamRevenue)} detail="Total value of the team's orders" highlight />
        </section>

        <section aria-label="Team financial summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 16 }}>
          <SummaryCard label="Team earned" value={formatMoney(teamEarned)} detail="Commission, settled once through the owner" />
          <SummaryCard label="Paid out" value={formatMoney(paidOut)} detail="Payments recorded" />
          <SummaryCard label="Outstanding" value={formatMoney(outstanding)} detail="Still owed to the team" highlight />
        </section>

        <section aria-labelledby="members-heading" style={{ ...cardStyle, marginBottom: 28, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${colors.borderLight}` }}>
            <h2 id="members-heading" style={sectionHeading}>Members</h2>
            <p style={sectionSubheading}>Everything per team member: activity, rate, status and access.</p>
          </div>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.borderLight}`, background: '#fcfbfd' }}>
            <TeamInviteForm organizationId={organizationId} adminView onInvited={load} />
          </div>
          {members.length === 0 ? (
            <div style={{ padding: 28, color: colors.lovelabMuted, textAlign: 'center', fontSize: 13 }}>No members found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={tableHead}>Name</th>
                    <th style={tableHead}>Role</th>
                    <th style={tableHead}>Status</th>
                    <th style={{ ...tableHead, textAlign: 'right' }}>Documents</th>
                    <th style={{ ...tableHead, textAlign: 'right' }}>Revenue</th>
                    <th style={tableHead}>Rate</th>
                    <th style={{ ...tableHead, textAlign: 'right' }}>Outstanding</th>
                    <th style={{ ...tableHead, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((member) => {
                    const profile = member.profiles || member.profile || {}
                    const agent = agentsById.get(member.user_id) || profile
                    const effective = resolveEffectiveRate(agent, organization)
                    const memberLedger = ledgerByUserId.get(member.user_id) || member.ledger || {}
                    const memberOutstanding = firstNumber(memberLedger, ['pending_balance', 'outstanding', 'outstanding_balance', 'owed'])
                    const activity = memberActivity(member.user_id)
                    const status = profile.agent_status || 'active'
                    const isBusy = busyUserId === member.user_id
                    const href = `/admin/agents/${member.user_id}`
                    return (
                      <tr
                        key={member.user_id}
                        data-testid={`organization-member-${member.user_id}`}
                        onClick={() => router.push(href)}
                        onKeyDown={(event) => {
                          // Enter/space on an action button must not also open the row.
                          if (event.target !== event.currentTarget) return
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            router.push(href)
                          }
                        }}
                        tabIndex={0}
                        aria-label={`View ${profile.full_name || profile.email || 'member'}`}
                        style={{ borderBottom: `1px solid ${colors.borderLight}`, cursor: 'pointer' }}
                      >
                        <td style={tableCell}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>{profile.full_name || profile.email || 'Unnamed member'}</div>
                          {profile.full_name && <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 2 }}>{profile.email}</div>}
                        </td>
                        <td style={tableCell}><RolePill role={member.role} /></td>
                        <td style={tableCell}><StatusPill status={status} /></td>
                        <td style={{ ...tableCell, textAlign: 'right' }}>
                          {activity.documents === 0 ? (
                            <span style={{ color: colors.lovelabMuted }}>—</span>
                          ) : (
                            <>
                              <div style={{ fontWeight: 750, color: colors.charcoal }}>{formatCount(activity.documents)}</div>
                              <div style={{ fontSize: 10, color: colors.lovelabMuted, marginTop: 2 }}>
                                {formatCount(activity.orders)} {activity.orders === 1 ? 'order' : 'orders'}
                                {activity.quotes > 0 && ` · ${formatCount(activity.quotes)} ${activity.quotes === 1 ? 'quote' : 'quotes'}`}
                              </div>
                            </>
                          )}
                        </td>
                        <td style={{ ...tableCell, textAlign: 'right', fontWeight: 750, color: activity.revenue > 0 ? colors.charcoal : colors.lovelabMuted }}>
                          {activity.revenue === 0 && activity.documents === 0 ? '—' : formatMoney(activity.revenue)}
                        </td>
                        <td style={tableCell}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: colors.charcoal }}>{effective.rate}%</span>
                            <RateSource source={effective.source} />
                          </div>
                        </td>
                        <td style={{ ...tableCell, textAlign: 'right', fontWeight: 750, color: memberOutstanding > 0 ? colors.inkPlum : colors.lovelabMuted }}>{formatMoney(memberOutstanding)}</td>
                        <td style={{ ...tableCell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', gap: 6 }}>
                            {status === 'invited' && !profile.has_password_set && (
                              <RowActionButton disabled={isBusy} onClick={() => memberAction(member.user_id, 'resend_invite')}>
                                Resend invite
                              </RowActionButton>
                            )}
                            {status === 'paused' ? (
                              <RowActionButton disabled={isBusy} onClick={() => memberAction(member.user_id, 'reactivate')}>
                                Reactivate
                              </RowActionButton>
                            ) : (
                              <RowActionButton disabled={isBusy} onClick={() => memberAction(member.user_id, 'pause')}>
                                Pause
                              </RowActionButton>
                            )}
                            <RowActionButton danger disabled={isBusy} onClick={() => handleRemove(member)}>
                              Remove
                            </RowActionButton>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="payments-heading" style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 14 }}>
            <h2 id="payments-heading" style={sectionHeading}>Payments</h2>
            <p style={sectionSubheading}>One report, one payment — settle the whole team through the owner.</p>
          </div>
          <OrgSettlementCard organizationId={organizationId} />
        </section>

        <section aria-label="Revenue by fair">
          <RevenueByFairChart data={stats?.revenue_by_event || []} />
        </section>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, detail, highlight = false }) {
  return (
    <div style={{ ...cardStyle, padding: '18px 20px', borderColor: highlight ? colors.lovelabBorder : colors.border }}>
      <div style={valueLabel}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, color: highlight ? colors.inkPlum : colors.charcoal, marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 4 }}>{detail}</div>
    </div>
  )
}

function RolePill({ role }) {
  const owner = role === 'owner'
  return (
    <span style={{
      display: 'inline-flex',
      padding: '3px 8px',
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 700,
      textTransform: 'capitalize',
      background: owner ? '#fdf6e3' : '#f3f0f4',
      color: owner ? '#8a6a2c' : colors.inkPlum,
    }}>
      {owner ? 'Owner' : 'Member'}
    </span>
  )
}

function StatusPill({ status }) {
  const map = {
    active: { bg: '#f0fdf4', color: '#15803d', label: 'Active' },
    invited: { bg: '#eff6ff', color: '#1d4ed8', label: 'Invited' },
    paused: { bg: '#fff7ed', color: '#c2410c', label: 'Paused' },
    inactive: { bg: '#f3f4f6', color: '#6b7280', label: 'Inactive' },
  }
  const s = map[status] || map.active
  return (
    <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function RowActionButton({ children, onClick, disabled, danger }) {
  return (
    <button
      onClick={(event) => {
        // The whole row navigates on click; keep actions from opening the member.
        event.stopPropagation()
        onClick(event)
      }}
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

function RateSource({ source }) {
  const custom = source === 'agent'
  const unset = source === 'none'
  return (
    <span style={{
      padding: '2px 7px',
      borderRadius: 999,
      fontSize: 9,
      fontWeight: 700,
      background: custom ? '#f3f0f8' : '#f7f5f2',
      color: custom ? colors.inkPlum : colors.lovelabMuted,
      whiteSpace: 'nowrap',
    }}>
      {custom ? 'custom' : unset ? 'not set' : 'org default'}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', height: 38,
}

const cardStyle = {
  background: '#fff',
  borderRadius: 12,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 1px 3px rgba(74, 37, 69, 0.03)',
}

const sectionHeading = {
  margin: 0,
  fontSize: 15,
  fontWeight: 750,
  color: colors.inkPlum,
}

const sectionSubheading = {
  margin: '4px 0 0',
  fontSize: 11,
  lineHeight: 1.45,
  color: colors.lovelabMuted,
}

const valueLabel = {
  fontSize: 10,
  fontWeight: 750,
  color: colors.lovelabMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const helperText = {
  fontSize: 11,
  color: colors.lovelabMuted,
  lineHeight: 1.4,
  marginTop: 6,
}

const breadcrumbButton = {
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: colors.inkPlum,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 650,
}

const secondaryButton = {
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${colors.lovelabBorder}`,
  background: '#fff',
  color: colors.inkPlum,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const primaryButton = {
  padding: '9px 18px',
  borderRadius: 8,
  border: 'none',
  background: colors.inkPlum,
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const tableHead = {
  padding: '10px 18px',
  textAlign: 'left',
  background: '#fcfbfd',
  borderBottom: `1px solid ${colors.borderLight}`,
  color: colors.lovelabMuted,
  fontSize: 9,
  fontWeight: 750,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const tableCell = {
  padding: '13px 18px',
  verticalAlign: 'middle',
  fontSize: 12,
}
