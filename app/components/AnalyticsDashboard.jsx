'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts, brandGradient } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { fmt } from '@/lib/utils'
import { COLLECTIONS } from '@/lib/catalog'
import AnalyticsChatPanel from './AnalyticsChatPanel'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend,
} from 'recharts'

// ─── Color palette for charts ──────────────────────────────────────────────
const CHART_COLORS = [
  '#5D3A5E', '#c5a059', '#8957AF', '#C987C7', '#E09BC0',
  '#EDA5B8', '#3b82f6', '#27ae60', '#e67e22', '#dc2626',
  '#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6',
]

// ─── Vitrine helpers (shared with DocumentsPanel) ──────────────────────────
const VITRINE_REGEX = /(\d+)\s*vitrines?|vitrines?\s*[x×]?\s*(\d+)/i

function parseVitrineFromRemarks(remarks) {
  if (!remarks) return null
  const m = remarks.match(VITRINE_REGEX)
  if (!m) return remarks.toLowerCase().includes('vitrine') ? 1 : null
  return parseInt(m[1] || m[2], 10)
}

function resolveVitrineQty(doc) {
  const fs = doc?.metadata?.formState
  if (!fs) return null
  const { hasVitrine, vitrineQty, remarks } = fs
  const toggleQty = hasVitrine ? (vitrineQty || 1) : null
  const remarksQty = parseVitrineFromRemarks(remarks)
  if (toggleQty !== null && remarksQty !== null) return toggleQty
  if (toggleQty !== null) return toggleQty
  if (remarksQty !== null) return remarksQty
  return null
}

// ─── Custom Recharts tooltip ───────────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: colors.inkPlum, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || colors.charcoal }}>
          {p.name}: {formatter ? formatter(p.value) : p.value}
        </div>
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
function Section({ title, children, style: s }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden', ...s }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>{title}</div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

// ─── Ranked table ──────────────────────────────────────────────────────────
function RankedTable({ columns, rows, maxRows = 10 }) {
  const thS = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', background: '#faf8fc', borderBottom: `1px solid ${colors.lineGray}` }
  const tdS = { padding: '10px 12px', fontSize: 13, color: colors.charcoal, borderBottom: `1px solid ${colors.lineGray}` }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thS, width: 36, textAlign: 'center' }}>#</th>
            {columns.map((col, i) => (
              <th key={i} style={{ ...thS, textAlign: col.align || 'left' }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, maxRows).map((row, i) => (
            <tr key={i}>
              <td style={{ ...tdS, textAlign: 'center', fontWeight: 700, color: i < 3 ? colors.inkPlum : '#999', fontSize: 12 }}>{i + 1}</td>
              {columns.map((col, j) => (
                <td key={j} style={{ ...tdS, textAlign: col.align || 'left', fontWeight: col.bold ? 600 : 400, color: col.color || colors.charcoal }}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
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
          <span style={{ fontWeight: 600, color: colors.inkPlum }}>{item.value}</span>
        </div>
      ))}
      {items.length === 0 && <div style={{ fontSize: 12, color: '#ccc' }}>—</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Dashboard Component
// ═══════════════════════════════════════════════════════════════════════════

export default function AnalyticsDashboard() {
  const router = useRouter()
  const mobile = useIsMobile()

  const [documents, setDocuments] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [showChat, setShowChat] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [docsRes, eventsRes] = await Promise.all([
          fetch('/api/documents'),
          fetch('/api/events'),
        ])
        const docsData = await docsRes.json()
        const eventsData = await eventsRes.json()
        if (docsData.documents) setDocuments(docsData.documents)
        if (eventsData.events) setEvents(eventsData.events)
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [])

  // ─── Filtered docs based on event selector ────────────────────────────
  const docs = useMemo(() => {
    if (!selectedEventId) return documents
    return documents.filter(d => d.event_id === selectedEventId)
  }, [documents, selectedEventId])

  // ─── KPIs ─────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalRevenue = docs.reduce((s, d) => s + (d.total_amount || 0), 0)
    const orderCount = docs.filter(d => d.document_type === 'order').length
    const quoteCount = docs.filter(d => d.document_type === 'quote').length
    const avgOrder = orderCount > 0 ? totalRevenue / orderCount : 0
    let totalVitrines = 0
    docs.forEach(d => { const q = resolveVitrineQty(d); if (q) totalVitrines += q })
    return { totalRevenue, orderCount, quoteCount, avgOrder, totalVitrines, totalDocs: docs.length }
  }, [docs])

  // ─── Revenue per fair ─────────────────────────────────────────────────
  const revenuePerFair = useMemo(() => {
    if (selectedEventId) return []
    const map = new Map()
    documents.forEach(d => {
      const eid = d.event_id || '__none__'
      const eName = d.events?.name || 'No Event'
      if (!map.has(eid)) map.set(eid, { name: eName, revenue: 0, orders: 0 })
      const entry = map.get(eid)
      entry.revenue += d.total_amount || 0
      entry.orders++
    })
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [documents, selectedEventId])

  // ─── Client countries ─────────────────────────────────────────────────
  const countryData = useMemo(() => {
    const normalizeCountry = (raw) => {
      if (!raw || !raw.trim()) return 'Unknown'
      return raw.trim().replace(/\s+/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
    }
    const map = new Map()
    docs.forEach(d => {
      const country = normalizeCountry(d.metadata?.formState?.country)
      if (!map.has(country)) map.set(country, { name: country, count: 0, revenue: 0 })
      const entry = map.get(country)
      entry.count++
      entry.revenue += d.total_amount || 0
    })
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [docs])

  // ─── Top products (by quantity) ───────────────────────────────────────
  const productData = useMemo(() => {
    const validLabels = new Set(COLLECTIONS.map(c => c.label))
    const normalize = (name) => {
      if (!name) return null
      const upper = name.trim().toUpperCase()
      for (const c of COLLECTIONS) {
        if (c.label.toUpperCase() === upper || c.id.toUpperCase() === upper) return c.label
      }
      if (validLabels.has(name.trim())) return name.trim()
      return null
    }
    const map = new Map()
    docs.forEach(d => {
      const rows = d.metadata?.formState?.rows || []
      rows.forEach(r => {
        const label = normalize(r.collection)
        if (!label) return
        if (!map.has(label)) map.set(label, { name: label, qty: 0, revenue: 0 })
        const entry = map.get(label)
        entry.qty += parseInt(r.quantity) || 0
        entry.revenue += parseFloat(r.total) || 0
      })
    })
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty)
  }, [docs])

  // ─── Top clients (by revenue) ─────────────────────────────────────────
  const clientData = useMemo(() => {
    const map = new Map()
    docs.forEach(d => {
      const raw = (d.client_company || d.client_name || 'Unknown').trim().replace(/\s+/g, ' ')
      const key = raw.toLowerCase()
      if (!map.has(key)) map.set(key, { name: raw, revenue: 0, orders: 0 })
      const entry = map.get(key)
      entry.revenue += d.total_amount || 0
      entry.orders++
    })
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [docs])

  // ─── Sales timeline (by day) ──────────────────────────────────────────
  const timelineData = useMemo(() => {
    const map = new Map()
    docs.forEach(d => {
      const dateKey = new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      const sortKey = new Date(d.created_at).toISOString().slice(0, 10)
      if (!map.has(sortKey)) map.set(sortKey, { sortKey, date: dateKey, revenue: 0, orders: 0 })
      const entry = map.get(sortKey)
      entry.revenue += d.total_amount || 0
      entry.orders++
    })
    return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }, [docs])

  // ─── Quick stats: carats, shapes, packaging, cord colors ──────────────
  const quickStats = useMemo(() => {
    const validLabels = new Set(COLLECTIONS.map(c => c.label))
    const validIds = new Set(COLLECTIONS.map(c => c.id))
    const isValidRow = (r) => {
      if (!r.collection) return false
      const upper = r.collection.trim().toUpperCase()
      return validLabels.has(r.collection.trim()) || validIds.has(upper) ||
        COLLECTIONS.some(c => c.label.toUpperCase() === upper)
    }

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
    const lines = [`ANALYTICS SUMMARY (filtered by: ${eventName})`, '---']

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
    if (quickStats.cordColors.length > 0) {
      lines.push('CORD COLORS: ' + quickStats.cordColors.map(s => `${s.name}: ${s.value}`).join(', '))
    }
    if (quickStats.packaging.length > 0) {
      lines.push('PACKAGING: ' + quickStats.packaging.map(s => `${s.name}: ${s.value}`).join(', '))
    }

    return lines.join('\n')
  }, [kpis, revenuePerFair, productData, clientData, vitrineData, countryData, quickStats, selectedEventId, events])

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

  return (
    <div style={{ fontFamily: fonts.body, background: '#f8f8f8', minHeight: '100vh' }}>
      {/* ─── Header ─── */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${colors.lineGray}`, padding: `${mobile ? 12 : 16}px ${pad}px` }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src="/logo.png" alt="LoveLab" style={{ height: mobile ? 32 : 40, width: 'auto' }} />
            <h1 style={{ fontSize: mobile ? 18 : 22, fontWeight: 800, color: colors.inkPlum, margin: 0, fontFamily: fonts.heading }}>Analytics</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
                fontSize: 13, fontFamily: fonts.body, color: colors.charcoal, background: '#fff',
                cursor: 'pointer', minWidth: 180,
              }}
            >
              <option value="">All Events</option>
              {events.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <button
              onClick={() => setShowChat(true)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: fonts.body,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            ><span style={{ fontSize: 14 }}>AI</span> Ask AI</button>
            <button
              onClick={() => router.push('/')}
              style={{
                padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${colors.inkPlum}`,
                background: '#fdf7fa', color: colors.inkPlum, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: fonts.body,
              }}
            >Back</button>
          </div>
        </div>
      </div>

      {/* ─── Dashboard body ─── */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: `${gridGap}px ${pad}px` }}>

        {/* ─── KPI Cards ─── */}
        <div style={{ display: 'flex', gap: gridGap, flexWrap: 'wrap', marginBottom: gridGap }}>
          <KpiCard label="Total Revenue" value={fmt(kpis.totalRevenue)} sub={`${kpis.totalDocs} documents`} />
          <KpiCard label="Orders" value={kpis.orderCount} sub={`${kpis.quoteCount} quotes`} accent={colors.luxeGold} />
          <KpiCard label="Avg. Order Value" value={fmt(kpis.avgOrder)} />
          <KpiCard label="Vitrines" value={kpis.totalVitrines} sub={`${vitrineData.rows.length} orders with vitrines`} accent={colors.gradientDeep} />
        </div>

        {/* ─── Row 1: Revenue per Fair + Country Distribution ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: gridGap, marginBottom: gridGap }}>

          {/* Revenue per Fair */}
          {!selectedEventId ? (
            <Section title="Revenue per Fair">
              {revenuePerFair.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={revenuePerFair} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} fontSize={11} />
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
            <Section title="Sales Timeline">
              {timelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={timelineData} margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" fontSize={11} tick={{ fill: '#999' }} />
                    <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} fontSize={11} />
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                    <Area type="monotone" dataKey="revenue" stroke={colors.inkPlum} fill={`${colors.inkPlum}20`} strokeWidth={2} name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div style={{ color: '#999', fontSize: 13, padding: 20, textAlign: 'center' }}>No data</div>}
            </Section>
          )}

          {/* Client Countries */}
          <Section title="Client Countries">
            {countryData.length > 0 ? (
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexDirection: mobile ? 'column' : 'row' }}>
                <ResponsiveContainer width={mobile ? '100%' : '45%'} height={220}>
                  <PieChart>
                    <Pie data={countryData} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2} label={false}>
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
                    maxRows={7}
                  />
                </div>
              </div>
            ) : <div style={{ color: '#999', fontSize: 13, padding: 20, textAlign: 'center' }}>No country data</div>}
          </Section>
        </div>

        {/* ─── Row 2: Top Products + Top Clients ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: gridGap, marginBottom: gridGap }}>

          {/* Top Products */}
          <Section title="Top Products (by quantity)">
            {productData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={Math.min(productData.length * 36 + 40, 320)}>
                  <BarChart data={productData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" fontSize={11} />
                    <YAxis type="category" dataKey="name" width={140} fontSize={11} tick={{ fill: colors.charcoal }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="qty" name="Quantity" radius={[0, 6, 6, 0]} maxBarSize={24}>
                      {productData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <RankedTable
                  columns={[
                    { label: 'Collection', key: 'name' },
                    { label: 'Qty Sold', key: 'qty', align: 'center', bold: true },
                    { label: 'Revenue', key: 'revenue', align: 'right', render: (r) => fmt(r.revenue) },
                  ]}
                  rows={productData}
                />
              </>
            ) : <div style={{ color: '#999', fontSize: 13, padding: 20, textAlign: 'center' }}>No product data</div>}
          </Section>

          {/* Top Clients */}
          <Section title="Top Clients (by revenue)">
            <RankedTable
              columns={[
                { label: 'Company', key: 'name' },
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

          {/* Sales Timeline (always visible) */}
          {!selectedEventId && (
            <Section title="Sales Timeline">
              {timelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={timelineData} margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" fontSize={11} tick={{ fill: '#999' }} />
                    <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} fontSize={11} />
                    <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} />
                    <Area type="monotone" dataKey="revenue" stroke={colors.inkPlum} fill={`${colors.inkPlum}20`} strokeWidth={2} name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div style={{ color: '#999', fontSize: 13, padding: 20, textAlign: 'center' }}>No timeline data</div>}
            </Section>
          )}

          {/* Vitrine Summary */}
          {vitrineData.rows.length > 0 && (
            <Section title={`Vitrine Summary (${vitrineData.totalQty} total)`}>
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

        {/* ─── Row 4: Quick Stats Grid ─── */}
        <Section title="Quick Stats" style={{ marginBottom: gridGap }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <MiniStat label="Carat Breakdown" items={quickStats.carats} />
            <MiniStat label="Top Shapes" items={quickStats.shapes} />
            <MiniStat label="Sizes" items={quickStats.sizes} />
            <MiniStat label="Cord Colors" items={quickStats.cordColors} maxItems={8} />
            <MiniStat label="Packaging" items={quickStats.packaging} />
          </div>
        </Section>

        {/* ─── Footer ─── */}
        <div style={{ textAlign: 'center', padding: '20px 0 40px', fontSize: 11, color: '#bbb' }}>
          LoveLab Analytics — {documents.length} documents across {events.length} events
        </div>
      </div>

      {/* ─── AI Chat Panel ─── */}
      <AnalyticsChatPanel
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        analyticsContext={analyticsContext}
      />
    </div>
  )
}
