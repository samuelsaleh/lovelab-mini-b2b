'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { fmtRevenue as fmt, fmtStat, isHideRevenue } from '@/lib/utils'
import { normalizeCountry } from '@/lib/countries'
import { EXCLUDED_ORDER_CHANNELS } from '@/lib/organizations/teamStats'
import { resolveVitrineQty } from '@/lib/vitrines'
import { isKnownCollection, matchCollectionLabel } from '@/lib/collectionMatch'
import {
  buildColorBreakdown,
  buildCountryBreakdown,
  buildClientBreakdown,
  formatColorBreakdownForPrompt,
  productChartHeight,
  sortColorBreakdown,
} from '@/lib/analyticsBreakdowns'
import { clientNameFromDoc } from '@/lib/analyticsAliases'
import AnalyticsChatPanel from './AnalyticsChatPanel'
import { safeFetch } from '@/lib/api'
import {
  buildAnalyticsExportRows,
  analyticsExportFilename,
  generateAnalyticsWorkbookBuffer,
} from '@/lib/analyticsExport'
import {
  ComposedChart, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, CartesianGrid, Legend,
} from 'recharts'

// ─── Color palette for charts ──────────────────────────────────────────────
const CHART_COLORS = [
  '#5D3A5E', '#c5a059', '#8957AF', '#C987C7', '#E09BC0',
  '#EDA5B8', '#3b82f6', '#27ae60', '#e67e22', '#dc2626',
  '#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6',
]

// normalizeCountry imported from @/lib/countries — handles aliases, typos, non-English names
const normalizeCountryValue = normalizeCountry

// Vitrine parsing + catalogue matching live in lib/ so scripts/audit tooling
// can reuse the exact same rules the dashboard renders.

// ─── Timeline bucketing (pure, exported for tests) ─────────────────────────
// Groups documents into 'day' | 'week' (Monday-start) | 'month' buckets with
// revenue + document count per bucket, sorted chronologically.
export function bucketTimeline(docs, group = 'day') {
  const map = new Map()
  ;(docs || []).forEach(d => {
    const dt = new Date(d.created_at)
    if (isNaN(dt)) return
    let sortKey, dateKey
    if (group === 'month') {
      sortKey = dt.toISOString().slice(0, 7) // YYYY-MM
      dateKey = dt.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    } else if (group === 'week') {
      const monday = new Date(dt)
      const day = monday.getDay() // 0=Sun..6=Sat
      monday.setDate(monday.getDate() - ((day + 6) % 7))
      sortKey = monday.toISOString().slice(0, 10)
      dateKey = `wk ${monday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
    } else {
      sortKey = dt.toISOString().slice(0, 10)
      dateKey = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    }
    if (!map.has(sortKey)) map.set(sortKey, { sortKey, date: dateKey, revenue: 0, orders: 0 })
    const entry = map.get(sortKey)
    entry.revenue += d.total_amount || 0
    entry.orders++
  })
  return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

// ─── Agent / fair aggregators (pure, exported for tests) ───────────────────
// One order is one row with an agent_id (who) AND an event_id (where). These
// helpers slice that single row two independent ways, so revenue is never
// double-counted: an order counts once under its agent and once under its fair,
// and the grand total still equals the raw sum.

// Revenue + order count per selling agent (agent_id). Orders with no agent_id
// fall under an "unassigned" bucket the caller can choose to show or hide.
export function revenuePerAgent(docs, agentNameById = {}) {
  const map = new Map();
  ;(docs || []).forEach((d) => {
    if (d.document_type !== 'order') return;
    const id = d.agent_id || '__none__';
    const name = d.agent_id ? (agentNameById[d.agent_id] || 'Unknown agent') : 'No agent';
    if (!map.has(id)) map.set(id, { id, name, revenue: 0, orders: 0 });
    const entry = map.get(id);
    entry.revenue += d.total_amount || 0;
    entry.orders++;
  });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

// Agent x fair cross-tab: "at fair F, agent A brought N orders / EUR X". Only
// rows that have BOTH an agent and a fair event are included (that is the
// question being answered). Returns { fairs, agents, cells, rows } where cells
// is keyed `${agentId}|${eventId}`.
export function buildAgentFairMatrix(docs, { agentNameById = {}, fairNameById = {}, fairIds = null } = {}) {
  const isFair = (eid) => (fairIds ? fairIds.has(eid) : true);
  const cells = new Map();
  const fairSet = new Map();
  const agentSet = new Map();
  ;(docs || []).forEach((d) => {
    if (d.document_type !== 'order') return;
    if (!d.agent_id || !d.event_id) return;
    if (!isFair(d.event_id)) return;
    const key = `${d.agent_id}|${d.event_id}`;
    if (!cells.has(key)) cells.set(key, { agentId: d.agent_id, eventId: d.event_id, orders: 0, revenue: 0 });
    const c = cells.get(key);
    c.orders++;
    c.revenue += d.total_amount || 0;
    if (!fairSet.has(d.event_id)) fairSet.set(d.event_id, { id: d.event_id, name: fairNameById[d.event_id] || 'Fair', revenue: 0 });
    fairSet.get(d.event_id).revenue += d.total_amount || 0;
    if (!agentSet.has(d.agent_id)) agentSet.set(d.agent_id, { id: d.agent_id, name: agentNameById[d.agent_id] || 'Unknown agent', revenue: 0 });
    agentSet.get(d.agent_id).revenue += d.total_amount || 0;
  });
  const fairs = Array.from(fairSet.values()).sort((a, b) => b.revenue - a.revenue);
  const agents = Array.from(agentSet.values()).sort((a, b) => b.revenue - a.revenue);
  return { fairs, agents, cells };
}

// ─── Custom Recharts tooltip ───────────────────────────────────────────────
function hideSeries(rows, keys) {
  if (!isHideRevenue()) return rows
  return (rows || []).map((row) => {
    const next = { ...row }
    keys.forEach((k) => {
      if (typeof next[k] === 'number') next[k] = 0
    })
    return next
  })
}

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: colors.inkPlum, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || colors.charcoal }}>
          {p.name}: {isHideRevenue() ? '—' : (formatter ? formatter(p.value) : p.value)}
        </div>
      ))}
    </div>
  )
}

// ─── Sales Timeline Chart ──────────────────────────────────────────────────
function SalesTimelineChart({ data }) {
  const rotateLabels = data.length > 5
  // With many points, rendering every X label (interval={0}) turns the axis
  // into an unreadable smear. Skip labels so at most ~12 are shown; the
  // tooltip still reveals the exact date of every point on hover.
  const labelInterval = data.length > 14 ? Math.ceil(data.length / 12) - 1 : 0
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: rotateLabels ? 44 : 12 }}>
        <defs>
          <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={colors.inkPlum} stopOpacity={0.22} />
            <stop offset="95%" stopColor={colors.inkPlum} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="date"
          fontSize={11}
          tick={{ fill: '#999' }}
          angle={rotateLabels ? -35 : 0}
          textAnchor={rotateLabels ? 'end' : 'middle'}
          interval={labelInterval}
        />
        <YAxis
          yAxisId="rev"
          tickFormatter={(v) => (isHideRevenue() ? '—' : `€${(v / 1000).toFixed(0)}k`)}
          fontSize={12}
          tick={{ fill: '#bbb' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="cnt"
          orientation="right"
          fontSize={11}
          tick={{ fill: '#c5a059' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={28}
          tickFormatter={(v) => (isHideRevenue() ? '—' : v)}
        />
        <Legend
          verticalAlign="top"
          height={26}
          formatter={(value) => <span style={{ fontSize: 12, color: colors.charcoal }}>{value}</span>}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const rev = payload.find(p => p.dataKey === 'revenue')
            const cnt = payload.find(p => p.dataKey === 'orders')
            return (
              <div style={{
                background: '#fff', border: `1px solid ${colors.lineGray}`,
                borderRadius: 10, padding: '10px 14px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.10)', fontSize: 13,
              }}>
                <div style={{ fontWeight: 700, color: colors.inkPlum, marginBottom: 6 }}>{label}</div>
                {cnt && <div style={{ color: '#8a6a2c' }}>Orders: <strong>{fmtStat(cnt.value)}</strong></div>}
                {rev && <div style={{ color: colors.inkPlum, marginTop: 2 }}>Revenue: <strong>{fmt(rev.value)}</strong></div>}
              </div>
            )
          }}
        />
        <Bar yAxisId="cnt" dataKey="orders" name="Orders" fill="#c5a059" fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={30} />
        <Area
          yAxisId="rev"
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={colors.inkPlum}
          strokeWidth={2.5}
          fill="url(#salesGradient)"
          dot={data.length <= 40 ? { r: 3, fill: '#fff', stroke: colors.inkPlum, strokeWidth: 2 } : false}
          activeDot={{ r: 6, fill: colors.inkPlum }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ─── Small pill toggle (Day / Week / Month, All / B2B / B2C) ───────────────
function PillToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', background: '#f4f0f5', borderRadius: 8, padding: 2, gap: 2 }}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          data-testid={`pill-${opt.id}`}
          onClick={() => onChange(opt.id)}
          style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer',
            background: value === opt.id ? colors.inkPlum : 'transparent',
            color: value === opt.id ? '#fff' : colors.lovelabMuted,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`,
      padding: '20px 24px', flex: '1 1 200px', minWidth: 160,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent || colors.inkPlum, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ─── Section wrapper ───────────────────────────────────────────────────────
function Section({ title, children, style: s, actions = null }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden', ...s }}>
      <div style={{ padding: '11px 20px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 13, fontWeight: 700, color: colors.inkPlum, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span>{title}</span>
        {actions}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

// ─── Ranked table ──────────────────────────────────────────────────────────
function RankedTable({ columns, rows, maxRows = 10, maxHeight, onRowClick, isRowActive, tableTestId, rowTestId }) {
  const thS = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', background: '#faf8fc', borderBottom: `1px solid ${colors.lineGray}` }
  const tdS = { padding: '10px 12px', fontSize: 13, color: colors.charcoal, borderBottom: `1px solid ${colors.lineGray}` }
  const visible = maxRows == null ? rows : rows.slice(0, maxRows)
  return (
    <div data-testid={tableTestId} style={{ overflowX: 'auto', ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}) }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: 36, textAlign: 'center', position: maxHeight ? 'sticky' : undefined, top: 0 }}>#</th>
            {columns.map((col, i) => (
              <th key={i} style={{ ...thS, textAlign: col.align || 'left', position: maxHeight ? 'sticky' : undefined, top: 0 }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr
              key={i}
              data-testid={rowTestId ? rowTestId(row, i) : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer', background: isRowActive?.(row) ? '#faf8fc' : 'transparent' } : undefined}
            >
              <td style={{ ...tdS, textAlign: 'center', fontWeight: 700, color: i < 3 ? colors.inkPlum : '#999', fontSize: 12 }}>{fmtStat(i + 1)}</td>
              {columns.map((col, j) => {
                const raw = col.render ? col.render(row) : row[col.key]
                const value = !col.render && typeof raw === 'number' ? fmtStat(raw) : raw
                return (
                <td key={j} style={{ ...tdS, textAlign: col.align || 'left', fontWeight: col.bold ? 600 : 400, color: col.color || colors.charcoal }}>{value}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>No data</div>}
    </div>
  )
}

// ─── Mini stat card (for quick stats grid) ─────────────────────────────────
function MiniStat({ label, items, maxItems = 5 }) {
  return (
    <div style={{ background: '#faf8fc', borderRadius: 10, padding: '14px 16px', flex: '1 1 220px', minWidth: 200 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>{label}</div>
      {items.slice(0, maxItems).map((item, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
          <span style={{ color: colors.charcoal }}>{item.name}</span>
          <span style={{ fontWeight: 600, color: colors.inkPlum }}>{fmtStat(item.value)}</span>
        </div>
      ))}
      {items.length === 0 && <div style={{ fontSize: 12, color: '#ccc' }}>—</div>}
    </div>
  )
}

function ColorPaletteColumn({ title, items, showDate = false }) {
  return (
    <div data-testid={`color-palette-${title.toLowerCase()}`} style={{ flex: 1, minWidth: 220 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum, marginBottom: 10, letterSpacing: '0.04em' }}>
        {title} <span style={{ fontWeight: 500, color: colors.lovelabMuted }}>({fmtStat(items.length)})</span>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto', border: `1px solid ${colors.lineGray}`, borderRadius: 8 }}>
        {items.map((item) => {
          const hide = isHideRevenue()
          const unsold = !hide && item.qty === 0
          const soldDay = item.lastSoldAt ? String(item.lastSoldAt).slice(0, 10) : ''
          return (
            <div
              key={item.name}
              data-testid={`color-row-${title.toLowerCase()}-${item.name}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', fontSize: 12,
                borderBottom: `1px solid ${colors.lineGray}`,
                opacity: unsold ? 0.45 : 1,
                background: unsold ? '#fafafa' : '#fff',
              }}
            >
              <span style={{
                width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                background: item.hex || '#ddd',
                border: '1px solid rgba(0,0,0,0.12)',
              }} />
              <span style={{ flex: 1, color: colors.charcoal }}>{item.name}</span>
              <span style={{ fontWeight: 600, color: unsold ? '#999' : colors.inkPlum, minWidth: 36, textAlign: 'right' }}>
                {fmtStat(item.qty)}
              </span>
              <span style={{ color: unsold ? '#bbb' : '#666', minWidth: 64, textAlign: 'right' }}>
                {unsold || hide ? '—' : fmt(item.revenue)}
              </span>
              {showDate && (
                <span style={{ color: unsold ? '#ccc' : '#888', minWidth: 72, textAlign: 'right', fontSize: 11 }}>
                  {hide ? '—' : (soldDay || '—')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Dashboard Component
// ═══════════════════════════════════════════════════════════════════════════

export default function AnalyticsDashboard({ initialEventId = null, dataScope = 'all' }) {
  // Compact = phone OR iPad portrait → single-column charts/tables.
  // dataScope: 'all' (default — for org members this includes the whole
  // team's documents) or 'mine' (personal documents only).
  const { isCompact: mobile } = useResponsive()

  const [documents, setDocuments] = useState([])
  const [events, setEvents] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(initialEventId ?? '')
  // Agent dimension (documents.agent_id). Mutually exclusive with the event
  // filter — the dropdown sets one and clears the other.
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedCountry, setSelectedCountry] = useState('')
  const [showChat, setShowChat] = useState(false)
  // Channel scope: 'all' | 'b2b' | 'b2c'. B2C gets its own personalized view
  // (individual customers, no fairs/vitrines) so wholesale and website sales
  // don't blur together.
  const [channelScope, setChannelScope] = useState('all')
  // Sales Timeline grouping: 'day' | 'week' | 'month'.
  const [timelineGroup, setTimelineGroup] = useState('day')
  const [colorSort, setColorSort] = useState('qty')

  const isB2C = channelScope === 'b2c'

  // Paginate through /api/documents to load every doc, not just the most
  // recent 50 (the API's default page size). Without this, fairs older than
  // the most recent ~50 documents would show near-zero revenue and the KPI
  // totals would silently undercount.
  const fetchAllDocuments = async () => {
    const PER_PAGE = 200 // API hard-caps at 200 for non-consignment views
    const all = []
    let page = 1
    while (true) {
      // Note: cannot use summary=true here — country / product / vitrine
      // breakdowns rely on metadata.formState which summary mode strips.
      const scopeParam = dataScope === 'mine' ? '&scope=mine' : ''
      const res = await safeFetch(`/api/documents?page=${page}&per_page=${PER_PAGE}${scopeParam}`)
      const data = await res.json()
      const batch = Array.isArray(data?.documents) ? data.documents : []
      all.push(...batch)
      if (batch.length < PER_PAGE) break
      page += 1
      // Defensive cap: never loop forever even if the API returned full
      // pages indefinitely. 50 pages * 200 = 10,000 documents is plenty.
      if (page > 50) break
    }
    return all
  }

  const loadAnalytics = async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const [allDocs, eventsRes, agentsRes] = await Promise.all([
        fetchAllDocuments(),
        safeFetch('/api/events'),
        safeFetch('/api/agents?summary=true').catch(() => null),
      ])
      const eventsData = await eventsRes.json()
      if (agentsRes?.ok) {
        try {
          const agentsData = await agentsRes.json()
          setAgents((agentsData.agents || []).filter(a => a.agent_status === 'active' || a.agent_status === 'invited'))
        } catch { /* non-blocking — agent names just won't resolve */ }
      }
      // Exclude non-revenue channels (internal supplier orders, consignment,
      // stock write-offs, samples) and drafts (parked, unsent orders) from
      // every analytics number — same rule as teamStats / commission logic.
      setDocuments(allDocs.filter(d =>
        !EXCLUDED_ORDER_CHANNELS.includes(d.order_channel) && d.status !== 'draft'
      ))
      if (eventsData.events) setEvents(eventsData.events)
    } catch {
      setFetchError('Failed to load analytics data.')
    }
    setLoading(false)
  }

  useEffect(() => { loadAnalytics() }, [dataScope])

  // ─── Channel-scoped documents (before the event filter) ──────────────
  const channelDocs = useMemo(() => {
    if (channelScope === 'b2c') return documents.filter(d => d.order_channel === 'b2c')
    if (channelScope === 'b2b') return documents.filter(d => d.order_channel !== 'b2c')
    return documents
  }, [documents, channelScope])

  // ─── Lookup maps for the agent / fair dimensions ──────────────────────
  const agentNameById = useMemo(
    () => Object.fromEntries((agents || []).map(a => [a.id, a.full_name || a.email])),
    [agents],
  )
  const fairNameById = useMemo(
    () => Object.fromEntries((events || []).filter(e => (e.type || 'other') === 'fair').map(e => [e.id, e.name])),
    [events],
  )
  const fairIds = useMemo(
    () => new Set((events || []).filter(e => (e.type || 'other') === 'fair').map(e => e.id)),
    [events],
  )

  // ─── Filtered docs based on the event OR agent selector ───────────────
  // (drafts + non-revenue channels are already excluded at load time)
  const docs = useMemo(() => {
    if (selectedAgentId) return channelDocs.filter(d => d.agent_id === selectedAgentId)
    if (selectedEventId) return channelDocs.filter(d => d.event_id === selectedEventId)
    return channelDocs
  }, [channelDocs, selectedEventId, selectedAgentId])

  // ─── Excel export ─────────────────────────────────────────────────────
  // Exports exactly what the dashboard is showing: the channel pills and the
  // Event dropdown decide the rows. One row per order/quote, including the
  // client contact details, so a fair selection doubles as a follow-up list.
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  const selectedEventName = useMemo(
    () => events.find(e => e.id === selectedEventId)?.name || '',
    [events, selectedEventId],
  )

  const handleExport = async () => {
    if (isHideRevenue() || exporting || docs.length === 0) return
    setExporting(true)
    setExportError(null)
    try {
      const rows = buildAnalyticsExportRows(docs)
      const subtitle = [
        selectedEventName || 'All Events',
        channelScope === 'all' ? 'All channels' : channelScope.toUpperCase(),
        `${rows.length} row${rows.length === 1 ? '' : 's'}`,
      ].join('   ·   ')
      const buffer = await generateAnalyticsWorkbookBuffer({ rows, subtitle })
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = analyticsExportFilename({ eventName: selectedEventName, channelScope })
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportError('Could not build the Excel file. Try again.')
    } finally {
      setExporting(false)
    }
  }

  // ─── KPIs ─────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const orderDocs = docs.filter(d => d.document_type === 'order')
    const totalRevenue = orderDocs.reduce((s, d) => s + (d.total_amount || 0), 0)
    const orderCount = orderDocs.length
    const quoteCount = docs.filter(d => d.document_type === 'quote').length
    const avgOrder = orderCount > 0 ? totalRevenue / orderCount : 0
    let totalVitrines = 0
    docs.forEach(d => { const q = resolveVitrineQty(d); if (q) totalVitrines += q })
    // Unique customers — the headline that matters for B2C (website buyers
    // are individuals, so "vitrines" is meaningless there).
    const customerKeys = new Set(
      docs.map(d => clientNameFromDoc(d).key).filter((k) => k && k !== 'unknown')
    )
    return { totalRevenue, orderCount, quoteCount, avgOrder, totalVitrines, totalDocs: docs.length, uniqueCustomers: customerKeys.size }
  }, [docs])

  // ─── Revenue per fair ─────────────────────────────────────────────────
  // Only count `order` documents, so the per-fair bars sum to the same total
  // as the "Total Revenue" KPI above. Previously this also counted quotes,
  // which inflated bars relative to the KPI and made the chart inconsistent
  // with the top number.
  const revenuePerFair = useMemo(() => {
    if (selectedEventId) return []
    const map = new Map()
    channelDocs.forEach(d => {
      if (d.document_type !== 'order') return
      const eid = d.event_id || '__none__'
      const eName = d.events?.name || 'No Event'
      if (!map.has(eid)) map.set(eid, { name: eName, revenue: 0, orders: 0 })
      const entry = map.get(eid)
      entry.revenue += d.total_amount || 0
      entry.orders++
    })
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [channelDocs, selectedEventId])

  // ─── Revenue per agent (who brought the order) ────────────────────────
  // Uses documents.agent_id, so an order an admin typed on Bastian's behalf
  // still counts for Bastian, and a fair-tagged order still counts for its
  // agent. Only shown on the unfiltered / event views.
  const revenuePerAgentData = useMemo(() => {
    if (selectedAgentId) return []
    return revenuePerAgent(docs, agentNameById).filter(r => r.id !== '__none__')
  }, [docs, agentNameById, selectedAgentId])

  // ─── Agent x Fair cross-tab ───────────────────────────────────────────
  // "At fair F, agent A brought N orders." Only meaningful on the global view.
  const agentFairMatrix = useMemo(() => {
    if (selectedEventId || selectedAgentId) return { fairs: [], agents: [], cells: new Map() }
    return buildAgentFairMatrix(channelDocs, { agentNameById, fairNameById, fairIds })
  }, [channelDocs, agentNameById, fairNameById, fairIds, selectedEventId, selectedAgentId])

  // ─── Client countries ─────────────────────────────────────────────────
  const countryData = useMemo(() => buildCountryBreakdown(docs), [docs])

  const colorBreakdown = useMemo(() => buildColorBreakdown(docs), [docs])
  const sortedColors = useMemo(() => sortColorBreakdown(colorBreakdown, colorSort), [colorBreakdown, colorSort])

  const countryDetails = useMemo(() => {
    if (!selectedCountry) return []
    const map = new Map()
    docs.forEach((d) => {
      const country = normalizeCountryValue(d.metadata?.formState?.country)
      if (country !== selectedCountry) return
      const { key, name } = clientNameFromDoc(d)
      if (!map.has(key)) {
        map.set(key, { company: name, orders: 0, revenue: 0 })
      }
      const entry = map.get(key)
      entry.orders += 1
      entry.revenue += d.total_amount || 0
    })
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [docs, selectedCountry])

  // ─── Top products (by quantity) ───────────────────────────────────────
  const productData = useMemo(() => {
    const map = new Map()
    docs.forEach(d => {
      const rows = d.metadata?.formState?.rows || []
      rows.forEach(r => {
        const label = matchCollectionLabel(r.collection)
        if (!label) return
        if (!map.has(label)) map.set(label, { name: label, qty: 0, revenue: 0 })
        const entry = map.get(label)
        const qtyStr = String(r.quantity || '').replace(/[^\d.-]/g, '')
        entry.qty += parseInt(qtyStr) || 0
        entry.revenue += parseFloat(r.total) || 0
      })
    })
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty)
  }, [docs])

  // ─── Top clients (by revenue) — Stage / DE / FR's Friends already merged
  const clientData = useMemo(() => buildClientBreakdown(docs), [docs])

  // ─── Sales timeline (grouped by day / week / month) ───────────────────
  const timelineData = useMemo(() => bucketTimeline(docs, timelineGroup), [docs, timelineGroup])

  // ─── Quick stats: carats, shapes, packaging, cord colors ──────────────
  const quickStats = useMemo(() => {
    const isValidRow = (r) => isKnownCollection(r.collection)

    const caratMap = new Map()
    const shapeMap = new Map()
    const packMap = new Map()
    const cordMap = new Map()
    const sizeMap = new Map()

    docs.forEach(d => {
      const fs = d.metadata?.formState
      if (!fs) return

      if (fs.packaging && typeof fs.packaging === 'string') {
        const pk = fs.packaging.trim()
        if (pk) packMap.set(pk, (packMap.get(pk) || 0) + 1)
      }

      (fs.rows || []).forEach(r => {
        if (!isValidRow(r)) return
        const qty = parseInt(r.quantity) || 0
        if (r.carat) { const k = r.carat.trim(); caratMap.set(k, (caratMap.get(k) || 0) + qty) }
        if (r.shape) { const k = r.shape.trim(); shapeMap.set(k, (shapeMap.get(k) || 0) + qty) }
        if (r.colorCord) { const k = r.colorCord.trim(); cordMap.set(k, (cordMap.get(k) || 0) + qty) }
        if (r.size) { const k = r.size.trim(); sizeMap.set(k, (sizeMap.get(k) || 0) + qty) }
      })
    })

    const toSorted = (m) => Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    return {
      carats: toSorted(caratMap),
      shapes: toSorted(shapeMap),
      packaging: toSorted(packMap),
      cordColors: toSorted(cordMap),
      sizes: toSorted(sizeMap),
    }
  }, [docs])

  // ─── Vitrine data per event ───────────────────────────────────────────
  const vitrineData = useMemo(() => {
    const rows = docs
      .map(d => ({
        company: (d.client_company || d.client_name || 'Unknown').trim().replace(/\s+/g, ' '),
        qty: resolveVitrineQty(d),
        total: d.total_amount || 0,
      }))
      .filter(r => r.qty !== null)
    const totalQty = rows.reduce((s, r) => s + r.qty, 0)
    return { rows, totalQty }
  }, [docs])

  // ─── Serialized context for AI chatbot ─────────────────────────────────
  const analyticsContext = useMemo(() => {
    const eventName = selectedEventId
      ? events.find(e => e.id === selectedEventId)?.name || 'Unknown'
      : 'All Events'
    const scopeLabel = channelScope === 'b2c' ? 'B2C (website/individual sales)' : channelScope === 'b2b' ? 'B2B (wholesale)' : 'All channels'
    const lines = [`ANALYTICS SUMMARY (filtered by: ${eventName} · scope: ${scopeLabel})`, '---']

    lines.push(`KPIs: Total Revenue: ${fmt(kpis.totalRevenue)} | Orders: ${kpis.orderCount} | Quotes: ${kpis.quoteCount} | Avg Order: ${fmt(kpis.avgOrder)} | Vitrines: ${kpis.totalVitrines} | Total Documents: ${kpis.totalDocs}`)
    lines.push('---')

    if (revenuePerFair.length > 0) {
      lines.push('REVENUE PER FAIR:')
      revenuePerFair.forEach(r => lines.push(`- ${r.name}: ${fmt(r.revenue)} (${r.orders} orders)`))
      lines.push('---')
    }

    if (productData.length > 0) {
      lines.push('TOP PRODUCTS (by quantity):')
      productData.forEach((p, i) => lines.push(`${i + 1}. ${p.name} - ${p.qty} units, ${fmt(p.revenue)}`))
      lines.push('---')
    }

    if (clientData.length > 0) {
      lines.push('TOP CLIENTS (by revenue):')
      clientData.slice(0, 20).forEach((c, i) => lines.push(`${i + 1}. ${c.name} - ${fmt(c.revenue)} (${c.orders} orders)`))
      lines.push('---')
    }

    if (vitrineData.rows.length > 0) {
      lines.push(`VITRINE BREAKDOWN (${vitrineData.totalQty} total):`)
      vitrineData.rows.forEach(r => lines.push(`- ${r.company}: ${r.qty} vitrine${r.qty > 1 ? 's' : ''}, order total ${fmt(r.total)}`))
      lines.push('---')
    }

    if (countryData.length > 0) {
      lines.push('COUNTRIES: ' + countryData.map(c => `${c.name}: ${c.count}`).join(', '))
    }

    if (quickStats.shapes.length > 0) {
      lines.push('SHAPES: ' + quickStats.shapes.map(s => `${s.name}: ${s.value}`).join(', '))
    }
    if (quickStats.carats.length > 0) {
      lines.push('CARATS: ' + quickStats.carats.map(s => `${s.name}: ${s.value}`).join(', '))
    }
    if (quickStats.sizes.length > 0) {
      lines.push('SIZES: ' + quickStats.sizes.map(s => `${s.name}: ${s.value}`).join(', '))
    }
    if (colorBreakdown.nylon.length + colorBreakdown.silk.length > 0) {
      lines.push(formatColorBreakdownForPrompt(colorBreakdown))
    }
    if (quickStats.packaging.length > 0) {
      lines.push('PACKAGING: ' + quickStats.packaging.map(s => `${s.name}: ${s.value}`).join(', '))
    }

    return lines.join('\n')
  }, [kpis, revenuePerFair, productData, clientData, vitrineData, countryData, colorBreakdown, quickStats, selectedEventId, events, channelScope])

  // ─── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ fontFamily: fonts.body, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8f8f8' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: colors.inkPlum, marginBottom: 8 }}>Loading Analytics...</div>
          <div style={{ fontSize: 13, color: '#999' }}>Fetching your data</div>
        </div>
      </div>
    )
  }

  const pad = mobile ? 12 : 24
  const gridGap = mobile ? 12 : 20

  const timelineToggle = (
    <PillToggle
      options={[
        { id: 'day', label: 'Day' },
        { id: 'week', label: 'Week' },
        { id: 'month', label: 'Month' },
      ]}
      value={timelineGroup}
      onChange={setTimelineGroup}
    />
  )

  return (
    <div style={{ fontFamily: fonts.body, background: '#f8f8f8', flex: 1, overflowY: 'auto' }}>
      {fetchError && (
        <div style={{ padding: 14, margin: '16px 24px 0', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {fetchError}
          <button onClick={loadAnalytics} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Retry</button>
        </div>
      )}
      {/* ─── Filter toolbar ─── */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${colors.lineGray}`, padding: `${mobile ? 8 : 10}px ${pad}px` }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <PillToggle
            options={[
              { id: 'all', label: 'All' },
              { id: 'b2b', label: 'B2B' },
              { id: 'b2c', label: 'B2C' },
            ]}
            value={channelScope}
            onChange={(v) => { setChannelScope(v); setSelectedCountry('') }}
          />
          <select
            value={selectedAgentId ? `agent:${selectedAgentId}` : selectedEventId}
            onChange={(e) => {
              const val = e.target.value
              if (val.startsWith('agent:')) {
                setSelectedAgentId(val.slice('agent:'.length))
                setSelectedEventId('')
              } else {
                setSelectedEventId(val)
                setSelectedAgentId('')
              }
              setSelectedCountry('')
            }}
            style={{
              padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
              fontSize: 13, fontFamily: fonts.body, color: colors.charcoal, background: '#fff',
              cursor: 'pointer', minWidth: 180,
            }}
          >
            <option value="">All Events & Agents</option>
            {/* Agents are their own dimension now (documents.agent_id), not
                agent-folder events. */}
            {agents.length > 0 && (
              <optgroup label="Agents">
                {[...agents]
                  .sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''))
                  .map(a => (
                    <option key={a.id} value={`agent:${a.id}`}>{a.full_name || a.email}</option>
                  ))}
              </optgroup>
            )}
            {[
              { key: 'fair', label: 'Fairs' },
              { key: 'partner', label: 'Partners' },
              { key: 'other', label: 'Other' },
            ].map(group => {
              const groupEvents = events.filter(e => (e.type || 'other') === group.key);
              if (groupEvents.length === 0) return null;
              return (
                <optgroup key={group.key} label={group.label}>
                  {groupEvents.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {isB2C && (
            <span style={{ fontSize: 12, color: colors.lovelabMuted }}>
              Website / individual sales only
            </span>
          )}
          </div>
          {!isHideRevenue() && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleExport}
              disabled={exporting || docs.length === 0}
              title={docs.length === 0
                ? 'Nothing to export for the current filters'
                : `Export ${docs.length} row${docs.length === 1 ? '' : 's'} with client contact details`}
              style={{
                padding: '8px 16px', borderRadius: 8,
                border: `1px solid ${colors.lineGray}`,
                background: '#fff', color: colors.inkPlum, fontSize: 13, fontWeight: 700,
                cursor: exporting || docs.length === 0 ? 'default' : 'pointer',
                opacity: exporting || docs.length === 0 ? 0.5 : 1,
                fontFamily: fonts.body,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {exporting ? 'Building…' : 'Export Excel'}
            </button>
            <button
              onClick={() => setShowChat(true)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: fonts.body,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            ><span style={{ fontSize: 14 }}>AI</span> Ask AI</button>
          </div>
          )}
        </div>
        {exportError && (
          <div role="alert" style={{ maxWidth: 1400, margin: '8px auto 0', fontSize: 12, color: '#dc2626' }}>
            {exportError}
          </div>
        )}
      </div>

      {/* ─── Dashboard body ─── */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${gridGap}px ${pad}px` }}>

        {/* ─── KPI Cards ─── */}
        <div style={{ display: 'flex', gap: gridGap, flexWrap: 'wrap', marginBottom: gridGap }}>
          <KpiCard label={isB2C ? 'B2C Revenue' : 'Total Revenue'} value={fmt(kpis.totalRevenue)} sub={isHideRevenue() ? '—' : `${kpis.totalDocs} documents`} />
          <KpiCard label="Orders" value={fmtStat(kpis.orderCount)} sub={isHideRevenue() ? '—' : `${kpis.quoteCount} quotes`} accent={colors.luxeGold} />
          <KpiCard label="Avg. Order Value" value={fmt(kpis.avgOrder)} />
          {isB2C ? (
            <KpiCard label="Customers" value={fmtStat(kpis.uniqueCustomers)} sub="unique buyers" accent={colors.gradientDeep} />
          ) : (
            <KpiCard label="Vitrines" value={fmtStat(kpis.totalVitrines)} sub={isHideRevenue() ? '—' : `${vitrineData.rows.length} orders with vitrines`} accent={colors.gradientDeep} />
          )}
        </div>

        {/* ─── Row 1: Revenue per Fair + Country Distribution ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: gridGap, marginBottom: gridGap }}>

          {/* Revenue per Fair — hidden in B2C scope (website sales aren't fairs);
              the Sales Timeline takes this slot instead. */}
          {!selectedEventId && !isB2C ? (
            <Section title="Revenue per Fair">
              {revenuePerFair.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={hideSeries(revenuePerFair, ['revenue', 'orders'])} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" tickFormatter={(v) => (isHideRevenue() ? '—' : `€${(v / 1000).toFixed(0)}k`)} fontSize={11} />
                      <YAxis type="category" dataKey="name" width={100} fontSize={11} tick={{ fill: colors.charcoal }} />
                      <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                      <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={28}>
                        {revenuePerFair.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <RankedTable
                    columns={[
                      { label: 'Event', key: 'name' },
                      { label: 'Orders', key: 'orders', align: 'center' },
                      { label: 'Revenue', key: 'revenue', align: 'right', bold: true, render: (r) => fmt(r.revenue) },
                    ]}
                    rows={revenuePerFair}
                  />
                </>
              ) : <div style={{ color: '#999', fontSize: 13, padding: 20, textAlign: 'center' }}>No events yet</div>}
            </Section>
          ) : (
            <Section title={isB2C ? 'B2C Sales Timeline' : 'Sales Timeline'} actions={timelineToggle}>
              {timelineData.length > 0
                ? <SalesTimelineChart data={hideSeries(timelineData, ['revenue', 'orders'])} />
                : <div style={{ color: '#999', fontSize: 13, padding: 20, textAlign: 'center' }}>No data</div>}
            </Section>
          )}

          {/* Client Countries */}
          <Section title="Client Countries">
            {countryData.length > 0 ? (
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexDirection: mobile ? 'column' : 'row' }}>
                <ResponsiveContainer width={mobile ? '100%' : '45%'} height={220}>
                  <PieChart>
                    <Pie data={hideSeries(countryData, ['revenue', 'count'])} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2} label={false}>
                      {countryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, width: '100%' }}>
                  <RankedTable
                    columns={[
                      { label: 'Country', key: 'name' },
                      { label: 'Clients', key: 'count', align: 'center' },
                      { label: 'Revenue', key: 'revenue', align: 'right', bold: true, render: (r) => fmt(r.revenue) },
                    ]}
                    rows={countryData}
                    maxRows={null}
                    maxHeight={280}
                    tableTestId="countries-table"
                    rowTestId={(row) => `country-row-${row.name}`}
                    onRowClick={(row) => setSelectedCountry((prev) => (prev === row.name ? '' : row.name))}
                    isRowActive={(row) => selectedCountry === row.name}
                  />
                  {selectedCountry && (
                    <div style={{ marginTop: 10, border: `1px solid ${colors.lineGray}`, borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '9px 12px', background: '#faf8fc', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum }}>
                          {selectedCountry} - companies
                        </div>
                        <button
                          onClick={() => setSelectedCountry('')}
                          style={{ border: 'none', background: 'transparent', color: '#999', cursor: 'pointer', fontSize: 12, fontFamily: fonts.body }}
                        >
                          Clear
                        </button>
                      </div>
                      <table data-testid="country-companies-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ ...thStyleMini, textAlign: 'left' }}>Company</th>
                            <th style={{ ...thStyleMini, textAlign: 'center' }}>Orders</th>
                            <th style={{ ...thStyleMini, textAlign: 'right' }}>Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {countryDetails.map((row, idx) => (
                            <tr key={`${row.company}-${idx}`} data-testid={`company-row-${row.company}`}>
                              <td style={tdStyleMini}>{row.company}</td>
                              <td style={{ ...tdStyleMini, textAlign: 'center' }}>{fmtStat(row.orders)}</td>
                              <td style={{ ...tdStyleMini, textAlign: 'right', fontWeight: 700, color: colors.inkPlum }}>{fmt(row.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : <div style={{ color: '#999', fontSize: 13, padding: 20, textAlign: 'center' }}>No country data</div>}
          </Section>
        </div>

        {/* ─── Row 1b: Revenue per Agent + Agent x Fair cross-tab ─── */}
        {!isB2C && (revenuePerAgentData.length > 0 || agentFairMatrix.agents.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: gridGap, marginBottom: gridGap }}>
            {revenuePerAgentData.length > 0 && (
              <Section title="Revenue per Agent">
                <ResponsiveContainer width="100%" height={Math.min(revenuePerAgentData.length * 34 + 40, 300)}>
                  <BarChart data={hideSeries(revenuePerAgentData, ['revenue', 'orders'])} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" tickFormatter={(v) => (isHideRevenue() ? '—' : `€${(v / 1000).toFixed(0)}k`)} fontSize={11} />
                    <YAxis type="category" dataKey="name" width={120} fontSize={11} tick={{ fill: colors.charcoal }} />
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                    <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={26}>
                      {revenuePerAgentData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <RankedTable
                  columns={[
                    { label: 'Agent', key: 'name' },
                    { label: 'Orders', key: 'orders', align: 'center' },
                    { label: 'Revenue', key: 'revenue', align: 'right', bold: true, render: (r) => fmt(r.revenue) },
                  ]}
                  rows={revenuePerAgentData}
                  onRowClick={(row) => setSelectedAgentId((prev) => (prev === row.id ? '' : row.id))}
                  isRowActive={(row) => selectedAgentId === row.id}
                />
              </Section>
            )}

            {agentFairMatrix.agents.length > 0 && agentFairMatrix.fairs.length > 0 && (
              <Section title="Who sold what, at which fair">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyleMini, textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}>Agent</th>
                        {agentFairMatrix.fairs.map((f) => (
                          <th key={f.id} style={{ ...thStyleMini, textAlign: 'center' }}>{f.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agentFairMatrix.agents.map((a) => (
                        <tr key={a.id}>
                          <td style={{ ...tdStyleMini, fontWeight: 600, position: 'sticky', left: 0, background: '#fff' }}>{a.name}</td>
                          {agentFairMatrix.fairs.map((f) => {
                            const c = agentFairMatrix.cells.get(`${a.id}|${f.id}`)
                            return (
                              <td key={f.id} style={{ ...tdStyleMini, textAlign: 'center' }}
                                title={c ? `${fmtStat(c.orders)} order${c.orders === 1 ? '' : 's'} · ${fmt(c.revenue)}` : ''}>
                                {c ? fmtStat(c.orders) : <span style={{ color: '#ddd' }}>—</span>}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
                  Number of orders each agent brought at each fair. Hover a cell for revenue. Each order is counted once.
                </div>
              </Section>
            )}
          </div>
        )}

        {/* ─── Row 2: Top Products + Top Clients ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: gridGap, marginBottom: gridGap }}>

          {/* Top Products */}
          <Section title="Top Products (by quantity)">
            {productData.length > 0 ? (
              <>
                <div data-testid="products-chart" style={{ maxHeight: 360, overflowY: 'auto' }}>
                  <ResponsiveContainer width="100%" height={productChartHeight(productData.length)}>
                    <BarChart data={hideSeries(productData, ['qty', 'revenue'])} layout="vertical" margin={{ top: 8, left: 10, right: 20, bottom: 8 }}>
                      <XAxis type="number" fontSize={11} tickFormatter={(v) => (isHideRevenue() ? '—' : v)} />
                      <YAxis type="category" dataKey="name" width={160} interval={0} fontSize={11} tick={{ fill: colors.charcoal }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="qty" name="Quantity" radius={[0, 6, 6, 0]} maxBarSize={24}>
                        {productData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <RankedTable
                  columns={[
                    { label: 'Collection', key: 'name' },
                    { label: 'Qty Sold', key: 'qty', align: 'center', bold: true },
                    { label: 'Revenue', key: 'revenue', align: 'right', render: (r) => fmt(r.revenue) },
                  ]}
                  rows={productData}
                  maxRows={null}
                  maxHeight={280}
                  tableTestId="products-table"
                  rowTestId={(row) => `product-row-${row.name}`}
                />
              </>
            ) : <div style={{ color: '#999', fontSize: 13, padding: 20, textAlign: 'center' }}>No product data</div>}
          </Section>

          {/* Top Clients */}
          <Section title={isB2C ? 'Top Customers (by revenue)' : 'Top Clients (by revenue)'}>
            <RankedTable
              columns={[
                { label: isB2C ? 'Customer' : 'Company', key: 'name' },
                { label: 'Orders', key: 'orders', align: 'center' },
                { label: 'Revenue', key: 'revenue', align: 'right', bold: true, color: colors.inkPlum, render: (r) => fmt(r.revenue) },
              ]}
              rows={clientData}
              maxRows={15}
            />
          </Section>
        </div>

        {/* ─── Row 3: Sales Timeline (global) + Vitrine Summary ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: gridGap, marginBottom: gridGap }}>

          {/* Sales Timeline (always visible) — in B2C scope it already sits in
              Row 1, so don't render it twice. */}
          {!selectedEventId && !isB2C && (
            <Section title="Sales Timeline" actions={timelineToggle}>
              {timelineData.length > 0
                ? <SalesTimelineChart data={hideSeries(timelineData, ['revenue', 'orders'])} />
                : <div style={{ color: '#999', fontSize: 13, padding: 20, textAlign: 'center' }}>No timeline data</div>}
            </Section>
          )}

          {/* Vitrine Summary */}
          {vitrineData.rows.length > 0 && (
            <Section title={isHideRevenue() ? 'Vitrine Summary' : `Vitrine Summary (${vitrineData.totalQty} total)`}>
              <RankedTable
                columns={[
                  { label: 'Company', key: 'company' },
                  { label: 'Vitrines', key: 'qty', align: 'center', bold: true, color: colors.inkPlum },
                  { label: 'Order Total', key: 'total', align: 'right', render: (r) => r.total ? fmt(r.total) : '—' },
                ]}
                rows={vitrineData.rows}
                maxRows={20}
              />
            </Section>
          )}
        </div>

        {/* ─── Row 4: Colors sold — full Nylon + Silk palettes ─── */}
        <Section
          title="Colors sold"
          style={{ marginBottom: gridGap }}
          actions={(
            <PillToggle
              options={[
                { id: 'chrono', label: 'Date' },
                { id: 'revenue', label: 'Revenue' },
                { id: 'name', label: 'Colour' },
                { id: 'qty', label: 'Pieces' },
              ]}
              value={colorSort}
              onChange={setColorSort}
            />
          )}
        >
          <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
            Every Nylon and Silk thread colour. Unsold colours stay at 0 so missing range is visible.
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <ColorPaletteColumn title="Nylon" items={sortedColors.nylon} showDate={colorSort === 'chrono'} />
            <ColorPaletteColumn title="Silk" items={sortedColors.silk} showDate={colorSort === 'chrono'} />
            {sortedColors.other.length > 0 && (
              <ColorPaletteColumn title="Other" items={sortedColors.other} showDate={colorSort === 'chrono'} />
            )}
          </div>
        </Section>

        {/* ─── Row 5: Quick Stats Grid ─── */}
        <Section title="Quick Stats" style={{ marginBottom: gridGap }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <MiniStat label="Carat Breakdown" items={quickStats.carats} />
            <MiniStat label="Top Shapes" items={quickStats.shapes} />
            <MiniStat label="Sizes" items={quickStats.sizes} />
            <MiniStat label="Packaging" items={quickStats.packaging} />
          </div>
        </Section>

        {/* ─── Footer ─── */}
        <div style={{ textAlign: 'center', padding: '20px 0 40px', fontSize: 11, color: '#bbb' }}>
          LoveLab Analytics — {isHideRevenue() ? '—' : `${documents.length} documents across ${events.length} events`}
        </div>
      </div>

      {/* ─── AI Chat Panel ─── */}
      {!isHideRevenue() && (
      <AnalyticsChatPanel
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        analyticsContext={analyticsContext}
        docs={docs}
      />
      )}
    </div>
  )
}

const thStyleMini = {
  padding: '8px 10px',
  fontSize: 10,
  fontWeight: 700,
  color: colors.lovelabMuted,
  textTransform: 'uppercase',
  borderBottom: `1px solid ${colors.lineGray}`,
  background: '#fff',
}

const tdStyleMini = {
  padding: '8px 10px',
  fontSize: 12,
  color: colors.charcoal,
  borderBottom: `1px solid ${colors.lineGray}`,
}
