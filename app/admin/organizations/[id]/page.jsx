'use client'

/**
 * Admin — Partner Team detail.
 *
 * The same accumulated TeamDashboard the org owner sees on /agent/team,
 * plus admin-only controls:
 *   - edit org settings (name, territory, commission rate, conditions)
 *   - invite members OR additional owners
 *   - pause/remove any member (including owners)
 *   - jump to each agent's /admin/agents/[id] detail page
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import TeamDashboard from '@/app/components/TeamDashboard'
import OrgSettlementCard from '@/app/components/OrgSettlementCard'
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

export default function AdminOrganizationDetailPage() {
  const { id: organizationId } = useParams()
  const router = useRouter()

  const [organization, setOrganization] = useState(null)
  const [members, setMembers] = useState([])
  const [ledger, setLedger] = useState(null)
  const [agentsById, setAgentsById] = useState(new Map())
  const [summaryError, setSummaryError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Settings editing
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', territory: '', commission_rate: '', conditions: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSummaryError(null)
    try {
      const [orgRes, membersRes, ledgerRes, agentsRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}`),
        fetch(`/api/organizations/${organizationId}/members`),
        fetch(`/api/organizations/${organizationId}/ledger`),
        fetch('/api/agents'),
      ])
      const [data, membersData, ledgerData, agentsData] = await Promise.all([
        orgRes.json().catch(() => ({})),
        membersRes.json().catch(() => ({})),
        ledgerRes.json().catch(() => ({})),
        agentsRes.json().catch(() => ({})),
      ])
      if (!orgRes.ok) throw new Error(data.error || 'load_failed')

      const auxiliaryFailures = []
      if (!membersRes.ok) auxiliaryFailures.push('members')
      if (!ledgerRes.ok) auxiliaryFailures.push('team totals')
      if (!agentsRes.ok) auxiliaryFailures.push('member rates')
      if (auxiliaryFailures.length > 0) {
        setSummaryError(`Some organization details could not be loaded: ${auxiliaryFailures.join(', ')}.`)
      }

      setOrganization(data.organization)
      setMembers(membersRes.ok ? (membersData.members || []) : [])
      setLedger(ledgerRes.ok ? ledgerData : null)
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

        <section aria-label="Team financial summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 16 }}>
          <SummaryCard label="Team earned" value={formatMoney(teamEarned)} detail="Total commission earned" />
          <SummaryCard label="Paid out" value={formatMoney(paidOut)} detail="Payments recorded" />
          <SummaryCard label="Outstanding" value={formatMoney(outstanding)} detail="Still owed to the team" highlight />
        </section>

        <section aria-labelledby="members-heading" style={{ ...cardStyle, marginBottom: 28, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${colors.borderLight}` }}>
            <h2 id="members-heading" style={sectionHeading}>Members</h2>
            <p style={sectionSubheading}>Rates and outstanding commission by team member.</p>
          </div>
          {members.length === 0 ? (
            <div style={{ padding: 28, color: colors.lovelabMuted, textAlign: 'center', fontSize: 13 }}>No members found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={tableHead}>Name</th>
                    <th style={tableHead}>Role</th>
                    <th style={tableHead}>Rate</th>
                    <th style={{ ...tableHead, textAlign: 'right' }}>Outstanding</th>
                    <th aria-label="Open member" style={{ ...tableHead, width: 42 }} />
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const profile = member.profiles || member.profile || {}
                    const agent = agentsById.get(member.user_id) || profile
                    const effective = resolveEffectiveRate(agent, organization)
                    const memberLedger = ledgerByUserId.get(member.user_id) || member.ledger || {}
                    const memberOutstanding = firstNumber(memberLedger, ['pending_balance', 'outstanding', 'outstanding_balance', 'owed'])
                    const href = `/admin/agents/${member.user_id}`
                    return (
                      <tr
                        key={member.user_id}
                        data-testid={`organization-member-${member.user_id}`}
                        onClick={() => router.push(href)}
                        onKeyDown={(event) => {
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
                        <td style={tableCell}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: colors.charcoal }}>{effective.rate}%</span>
                            <RateSource source={effective.source} />
                          </div>
                        </td>
                        <td style={{ ...tableCell, textAlign: 'right', fontWeight: 750, color: memberOutstanding > 0 ? colors.inkPlum : colors.lovelabMuted }}>{formatMoney(memberOutstanding)}</td>
                        <td aria-hidden="true" style={{ ...tableCell, color: colors.lovelabMuted, fontSize: 18, textAlign: 'center' }}>›</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="operations-heading">
          <div style={{ marginBottom: 14 }}>
            <h2 id="operations-heading" style={sectionHeading}>Operations and reporting</h2>
            <p style={sectionSubheading}>Manage members, documents, reports, payments, and detailed team performance.</p>
          </div>
          {/* Existing operational components stay intact so settlement,
              reporting, payments, member management and team analytics remain available. */}
          <OrgSettlementCard organizationId={organizationId} />
          <TeamDashboard organizationId={organizationId} adminView />
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
