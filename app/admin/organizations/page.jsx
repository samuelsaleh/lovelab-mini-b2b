'use client'

/**
 * Admin — Organizations overview.
 *
 * One card per partner organization (the reusable "partner company"
 * template): name, territory, owner, member count, and revenue. Clicking a
 * card opens the org detail page with the shared TeamDashboard + admin
 * controls. Orgs are auto-created on every agent invite, so there is no
 * create flow here — admins rename/configure them from the detail page.
 */

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { colors } from '@/lib/styles'
import SalesTeamTabs from '@/app/components/SalesTeamTabs'

const fmt = (n) => {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export default function AdminOrganizationsPage() {
  const router = useRouter()
  const [organizations, setOrganizations] = useState([])
  const [orgFolders, setOrgFolders] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [orgsResponse, foldersResponse, agentsResponse] = await Promise.all([
        fetch('/api/organizations'),
        fetch('/api/org-folders'),
        fetch('/api/agents'),
      ])
      const [orgsRes, foldersRes, agentsRes] = await Promise.all([
        orgsResponse.json().catch(() => ({})),
        foldersResponse.json().catch(() => ({})),
        agentsResponse.json().catch(() => ({})),
      ])

      // Keep partial data when one endpoint fails so the admin page still
      // opens instead of blanking the whole screen on a single API error.
      if (orgsResponse.ok) setOrganizations(orgsRes.organizations || [])
      else setOrganizations([])
      if (foldersResponse.ok) setOrgFolders(foldersRes.orgFolders || [])
      else setOrgFolders([])
      if (agentsResponse.ok) setAgents(agentsRes.agents || [])
      else setAgents([])

      const failures = []
      if (!orgsResponse.ok) failures.push(orgsRes.error || `organizations (${orgsResponse.status})`)
      if (!foldersResponse.ok) failures.push(foldersRes.error || `org-folders (${foldersResponse.status})`)
      if (!agentsResponse.ok) failures.push(agentsRes.error || `agents (${agentsResponse.status})`)
      if (failures.length > 0) setError(`Failed to load: ${failures.join(', ')}`)
    } catch (err) {
      setError(err?.message || 'Failed to load organizations.')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const cards = useMemo(() => {
    const foldersByOrg = new Map(orgFolders.map(f => [f.organization_id, f]))

    // Revenue per org approximated from the agents endpoint (same stats the
    // admin dashboard uses), grouped by each agent's organization.
    const revenueByOrg = new Map()
    for (const a of agents) {
      if (!a.organization_id) continue
      const rev = a.stats?.effective_revenue || a.stats?.total_revenue || 0
      revenueByOrg.set(a.organization_id, (revenueByOrg.get(a.organization_id) || 0) + rev)
    }

    return organizations
      .map(org => {
        const folder = foldersByOrg.get(org.id)
        const members = folder?.members || []
        const owner = members.find(m => m.role === 'owner')
        return {
          ...org,
          member_count: folder?.member_count ?? members.length,
          owner_name: owner?.full_name || owner?.email || '—',
          doc_count: folder?.doc_count ?? 0,
          revenue: revenueByOrg.get(org.id) || 0,
        }
      })
      .filter(org => {
        const q = search.trim().toLowerCase()
        if (!q) return true
        return (
          (org.name || '').toLowerCase().includes(q) ||
          (org.territory || '').toLowerCase().includes(q) ||
          (org.owner_name || '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.revenue - a.revenue || b.member_count - a.member_count)
  }, [organizations, orgFolders, agents, search])

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>Loading organizations...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <SalesTeamTabs active="partners" />
        {error && (
          <div style={{ padding: 14, marginBottom: 16, background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {error}
            <button onClick={load} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Retry</button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>Agent Teams</h2>
            <div style={{ fontSize: 12, color: colors.lovelabMuted, marginTop: 4 }}>
              One team can contain one or more agents with shared totals and payments.
            </div>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agent teams..."
            style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 260 }}
          />
        </div>

        {cards.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13, background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}` }}>
            No agent teams found
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {cards.map(org => (
              <div
                key={org.id}
                onClick={() => router.push(`/admin/organizations/${org.id}`)}
                style={{
                  background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`,
                  padding: '18px 20px', cursor: 'pointer', transition: 'all .12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = colors.inkPlum }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = colors.lineGray }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: colors.inkPlum, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {org.name}
                    </div>
                    <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 2 }}>
                      {org.territory || 'No territory set'}
                      {org.commission_rate != null && ` · ${org.commission_rate}%`}
                    </div>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#f3f0f4', color: colors.inkPlum }}>
                    {org.member_count} {org.member_count === 1 ? 'member' : 'members'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: colors.lovelabMuted, marginBottom: 10 }}>
                  Owner: <span style={{ color: colors.charcoal, fontWeight: 600 }}>{org.owner_name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10 }}>
                  <span style={{ fontSize: 11, color: colors.lovelabMuted }}>{org.doc_count} documents</span>
                  <span style={{ fontSize: 17, fontWeight: 800, color: colors.inkPlum }}>{fmt(org.revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
