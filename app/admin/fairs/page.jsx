'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'

const fmt = (n) => {
  if (n == null || n === 0) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export default function AdminFairsPage() {
  const [events, setEvents] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newType, setNewType] = useState('fair')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [evRes, docsRes] = await Promise.all([
        fetch('/api/events').then(r => r.json()),
        fetch('/api/documents').then(r => r.json()),
      ])
      setEvents(evRes.events || [])
      setDocuments(docsRes.documents || [])
    } catch {
      setError('Failed to load data')
    }
    setLoading(false)
  }

  const now = new Date()

  const groupedEvents = useMemo(() => {
    const groups = [
      { key: 'fair', label: 'Fairs', items: [] },
      { key: 'agent', label: 'Agents', items: [] },
      { key: 'partner', label: 'Partners', items: [] },
      { key: 'other', label: 'Other', items: [] },
    ]
    for (const e of events) {
      const stats = getEventStats(e)
      const item = { ...e, stats }
      const group = groups.find(g => g.key === (e.type || 'other'))
      if (group) group.items.push(item)
      else groups[3].items.push(item)
    }
    // Sort each group by revenue desc, then by start date desc. Surfaces the
    // top-performing fairs / agents at the top of each section — much easier
    // than scanning a name-sorted list to find who actually generated revenue.
    for (const g of groups) {
      g.items.sort((a, b) => {
        const rev = (b.stats?.revenue || 0) - (a.stats?.revenue || 0)
        if (rev !== 0) return rev
        return (b.start_date || '').localeCompare(a.start_date || '')
      })
    }
    return groups
  }, [events, documents])

  // For agent-type folders, prefer the server-computed agent_stats (orders /
  // revenue / team aggregated across the entire agent organization — what
  // the user actually expects to see). For fairs / partners / other, fall
  // back to per-event document tagging (the legacy behaviour, still correct
  // for those types since they aggregate per-event by definition).
  function getEventStats(event) {
    if (event.type === 'agent' && event.agent_stats) {
      return {
        orders: event.agent_stats.orders,
        revenue: event.agent_stats.revenue,
        creators: event.agent_stats.team,
      }
    }
    const docs = documents.filter(d => d.event_id === event.id)
    const revenue = docs.reduce((s, d) => s + (Number(d.total_amount) || 0), 0)
    const creators = new Set(docs.map(d => d.created_by).filter(Boolean))
    return { orders: docs.length, revenue, creators: creators.size }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          location: newLocation.trim() || null,
          start_date: newStart || null,
          end_date: newEnd || null,
          type: newType,
        }),
      })
      if (!res.ok) throw new Error('Failed to create')
      setNewName('')
      setNewLocation('')
      setNewStart('')
      setNewEnd('')
      setNewType('fair')
      setShowCreate(false)
      fetchData()
    } catch {
      setError('Failed to create event')
    }
    setCreating(false)
  }

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>Loading...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>Fairs, Agents & Partners</h1>
          <button onClick={() => setShowCreate(true)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}>
            + New Folder
          </button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
            {error}
            <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>x</button>
          </div>
        )}

        {showCreate && (
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: 20, marginBottom: 20 }}>
            <div style={sectionLabel}>Create New Folder</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. JCK Las Vegas 2026" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Category *</label>
                <select value={newType} onChange={e => setNewType(e.target.value)} style={inputStyle}>
                  <option value="fair">Fair</option>
                  <option value="agent">Agent</option>
                  <option value="partner">Partner</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <input value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="e.g. Las Vegas, USA" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Start Date</label>
                <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>End Date</label>
                <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.lineGray}`, background: '#fff', color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: fonts.body }}>Cancel</button>
              <button onClick={handleCreate} disabled={creating || !newName.trim()} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, opacity: creating ? 0.6 : 1 }}>
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {groupedEvents.map(group => {
          if (group.items.length === 0) return null
          return (
            <div key={group.key} style={{ marginBottom: 28 }}>
              <div style={{ ...sectionLabel, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ ...typeBadgeStyle, ...typeBadgeColors[group.key] }}>{group.label}</span>
                <span style={{ fontSize: 11, color: '#bbb' }}>{group.items.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.items.map(e => <FairCard key={e.id} event={e} />)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FairCard({ event }) {
  const e = event
  const s = e.stats || {}
  const router = useRouter()
  const dateStr = e.start_date
    ? `${new Date(e.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${e.end_date ? ` — ${new Date(e.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
    : null

  const isAgent = e.type === 'agent'
  // Agent folders deep-link to the per-agent admin page when the org has a
  // single agent. Multi-agent orgs and other folder types still go to
  // analytics filtered by event.
  const clickHref = isAgent && e.primary_agent_id
    ? `/admin/agents/${e.primary_agent_id}`
    : `/analytics?event=${e.id}`

  const initials = (e.name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?'

  return (
    <div
      onClick={() => router.push(clickHref)}
      style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'box-shadow 0.15s', gap: 12 }}
      onMouseEnter={ev => ev.currentTarget.style.boxShadow = '0 4px 16px rgba(93,58,94,0.10)'}
      onMouseLeave={ev => ev.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
        {isAgent && (
          e.primary_agent_avatar ? (
            <img src={e.primary_agent_avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fce7f3', color: '#9d174d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
          )
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.inkPlum, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
            {isAgent && e.primary_agent_status && <AgentStatusBadge status={e.primary_agent_status} />}
            {isAgent && e.agent_stats?.agent_count > 1 && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280' }}>
                {e.agent_stats.agent_count} agents
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 2 }}>
            {e.location && <span>{e.location} · </span>}
            {dateStr}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexShrink: 0 }}>
        <Stat label="Orders" value={s.orders} />
        <Stat label="Revenue" value={fmt(s.revenue)} />
        <Stat label="Team" value={s.creators} />
      </div>
    </div>
  )
}

function AgentStatusBadge({ status }) {
  const styles = {
    active:   { bg: '#dcfce7', fg: '#166534', label: 'Active' },
    invited:  { bg: '#fef3c7', fg: '#b45309', label: 'Invited' },
    paused:   { bg: '#fef9c3', fg: '#854d0e', label: 'Paused' },
    inactive: { bg: '#f3f4f6', fg: '#6b7280', label: 'Inactive' },
  }
  const s = styles[status] || styles.inactive
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: s.bg, color: s.fg, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {s.label}
    </span>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: colors.charcoal }}>{value}</div>
    </div>
  )
}

const sectionLabel = { fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }
const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${colors.lineGray}`, fontSize: 13, fontFamily: fonts.body, boxSizing: 'border-box' }
const typeBadgeStyle = { fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.04em' }
const typeBadgeColors = {
  fair: { background: '#dbeafe', color: '#1e40af' },
  agent: { background: '#fce7f3', color: '#9d174d' },
  partner: { background: '#d1fae5', color: '#065f46' },
  other: { background: '#f3f4f6', color: '#6b7280' },
}
