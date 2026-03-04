'use client'

import { useEffect, useMemo, useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import { COUNTRIES } from '@/lib/countries'

const fmt = (n) => {
  if (n == null || n === 0) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n) || 0)
}

const countriesLower = COUNTRIES.map((c) => c.toLowerCase())
const normalizeCountry = (raw) => {
  if (!raw || !String(raw).trim()) return 'Unknown'
  const cleaned = String(raw).trim().replace(/\s+/g, ' ')
  const lower = cleaned.toLowerCase()
  const idx = countriesLower.indexOf(lower)
  if (idx >= 0) return COUNTRIES[idx]
  for (let i = 0; i < COUNTRIES.length; i++) {
    if (lower.includes(countriesLower[i])) return COUNTRIES[i]
  }
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

const initialFilters = {
  dateFrom: '',
  dateTo: '',
  eventId: '',
  country: 'all',
  city: 'all',
  type: 'all',
  search: '',
  minAmount: '',
  maxAmount: '',
}

export default function ReportsDashboard() {
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState([])
  const [clients, setClients] = useState([])
  const [events, setEvents] = useState([])
  const [reports, setReports] = useState([])
  const [filters, setFilters] = useState(initialFilters)
  const [saveName, setSaveName] = useState('')
  const [selectedReportId, setSelectedReportId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [docsRes, eventsRes, reportsRes, clientsRes] = await Promise.all([
          fetch('/api/documents'),
          fetch('/api/events'),
          fetch('/api/reports'),
          fetch('/api/clients'),
        ])
        const docsData = await docsRes.json().catch(() => ({}))
        const eventsData = await eventsRes.json().catch(() => ({}))
        const reportsData = await reportsRes.json().catch(() => ({}))
        const clientsData = await clientsRes.json().catch(() => ({}))
        setDocuments(docsData.documents || [])
        setClients(clientsData.clients || [])
        setEvents(eventsData.events || [])
        setReports(reportsData.reports || [])
      } catch {
        setError('Failed to load reports data')
      }
      setLoading(false)
    }
    load()
  }, [])

  const documentRows = useMemo(() => {
    return documents.map((d) => ({
      ...d,
      rowType: 'document',
      sourceLabel: 'Order',
      sourceComment: null,
      country: normalizeCountry(d.metadata?.formState?.country),
      city: (d.metadata?.formState?.city || d.metadata?.formState?.location || '').trim() || 'Unknown',
      amount: Number(d.total_amount) || 0,
      dateISO: d.created_at ? new Date(d.created_at).toISOString().slice(0, 10) : '',
      clientLabel: d.client_company || d.client_name || 'Unknown',
      eventLabel: d.events?.name || 'No Event',
    }))
  }, [documents])

  const salesforceRows = useMemo(() => {
    return clients
      .filter((c) => c?.source === 'salesforce' || c?.vat === 'UNDER_SALESFORCE')
      .map((c) => ({
        id: `sf-${c.id}`,
        rowType: 'salesforce',
        sourceLabel: 'Salesforce',
        sourceComment: c.source_comment || 'Under Salesforce',
        country: normalizeCountry(c.country),
        city: (c.city || '').trim() || 'Unknown',
        amount: 0,
        dateISO: c.source_imported_at ? new Date(c.source_imported_at).toISOString().slice(0, 10) : '—',
        clientLabel: c.company || c.name || 'Unknown',
        eventLabel: 'Salesforce import',
        document_type: 'account',
        event_id: null,
      }))
  }, [clients])

  const rows = useMemo(() => [...documentRows, ...salesforceRows], [documentRows, salesforceRows])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filters.eventId && r.event_id !== filters.eventId) return false
      if (filters.country !== 'all' && r.country !== filters.country) return false
      if (filters.city !== 'all' && r.city !== filters.city) return false
      if (filters.type !== 'all' && r.document_type !== filters.type) return false
      if (filters.dateFrom && r.dateISO && r.dateISO < filters.dateFrom) return false
      if (filters.dateTo && r.dateISO && r.dateISO > filters.dateTo) return false
      if (filters.minAmount && r.amount < Number(filters.minAmount)) return false
      if (filters.maxAmount && r.amount > Number(filters.maxAmount)) return false
      if (filters.search.trim()) {
        const q = filters.search.trim().toLowerCase()
        if (
          !r.clientLabel.toLowerCase().includes(q) &&
          !r.country.toLowerCase().includes(q) &&
          !r.city.toLowerCase().includes(q) &&
          !r.eventLabel.toLowerCase().includes(q) &&
          !r.sourceLabel.toLowerCase().includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [rows, filters])

  const kpis = useMemo(() => {
    const documentOnly = filteredRows.filter((r) => r.rowType === 'document')
    const totalRevenue = documentOnly.reduce((sum, r) => sum + r.amount, 0)
    const totalOrders = documentOnly.filter((r) => r.document_type === 'order').length
    const totalQuotes = documentOnly.filter((r) => r.document_type === 'quote').length
    const avgOrderValue = totalOrders > 0
      ? documentOnly
          .filter((r) => r.document_type === 'order')
          .reduce((sum, r) => sum + r.amount, 0) / totalOrders
      : 0
    return { totalRevenue, totalOrders, totalQuotes, avgOrderValue }
  }, [filteredRows])

  const countryOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.country))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const cityOptions = useMemo(() => {
    const set = new Set(
      rows
        .filter((r) => (filters.country === 'all' ? true : r.country === filters.country))
        .map((r) => r.city),
    )
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows, filters.country])

  const applySavedReport = (reportId) => {
    setSelectedReportId(reportId)
    const report = reports.find((r) => r.id === reportId)
    if (!report) return
    setFilters({
      ...initialFilters,
      ...(report.config || {}),
    })
  }

  const saveReport = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName.trim(),
          entity_type: 'documents',
          config: filters,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save report')
      setReports((prev) => [data.report, ...prev])
      setSaveName('')
    } catch (err) {
      setError(err.message || 'Failed to save report')
    }
    setSaving(false)
  }

  const deleteSelectedReport = async () => {
    if (!selectedReportId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(selectedReportId)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete report')
      setReports((prev) => prev.filter((r) => r.id !== selectedReportId))
      setSelectedReportId('')
    } catch (err) {
      setError(err.message || 'Failed to delete report')
    }
    setSaving(false)
  }

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading reports...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, color: colors.inkPlum, margin: '0 0 14px', fontWeight: 800 }}>Reports</h1>
        <div style={{ fontSize: 13, color: '#777', marginBottom: 18 }}>
          Build filtered views across orders/quotes and save report presets.
        </div>

        {error && (
          <div style={{ marginBottom: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))} style={inputStyle} />
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))} style={inputStyle} />
            <select value={filters.eventId} onChange={(e) => setFilters((p) => ({ ...p, eventId: e.target.value }))} style={inputStyle}>
              <option value="">All events</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select
              value={filters.country}
              onChange={(e) => setFilters((p) => ({ ...p, country: e.target.value, city: 'all' }))}
              style={inputStyle}
            >
              <option value="all">All countries</option>
              {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={filters.city}
              onChange={(e) => setFilters((p) => ({ ...p, city: e.target.value }))}
              style={inputStyle}
            >
              <option value="all">All cities</option>
              {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filters.type} onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))} style={inputStyle}>
              <option value="all">Order + Quote</option>
              <option value="order">Order only</option>
              <option value="quote">Quote only</option>
            </select>
            <input
              value={filters.search}
              onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
              placeholder="Search client/country/event"
              style={inputStyle}
            />
            <input
              value={filters.minAmount}
              onChange={(e) => setFilters((p) => ({ ...p, minAmount: e.target.value }))}
              placeholder="Min €"
              style={inputStyle}
            />
            <input
              value={filters.maxAmount}
              onChange={(e) => setFilters((p) => ({ ...p, maxAmount: e.target.value }))}
              placeholder="Max €"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Kpi label="Total Revenue" value={fmt(kpis.totalRevenue)} />
          <Kpi label="Orders" value={kpis.totalOrders} />
          <Kpi label="Quotes" value={kpis.totalQuotes} />
          <Kpi label="Average Order" value={fmt(kpis.avgOrderValue)} />
        </div>

        <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={selectedReportId} onChange={(e) => applySavedReport(e.target.value)} style={{ ...inputStyle, minWidth: 220 }}>
              <option value="">Load saved report</option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Preset name"
              style={{ ...inputStyle, minWidth: 220 }}
            />
            <button onClick={saveReport} disabled={saving} style={btnPrimary}>
              Save preset
            </button>
            <button onClick={deleteSelectedReport} disabled={saving || !selectedReportId} style={btnDanger}>
              Delete selected
            </button>
          </div>
        </div>

        <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 12, color: '#777' }}>
            {filteredRows.length} result{filteredRows.length > 1 ? 's' : ''}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Date', 'Client', 'Country', 'City', 'Event', 'Type', 'Source', 'Amount'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#999', fontSize: 13 }}>No results for current filters.</td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.id}>
                      <td style={tdStyle}>{r.dateISO || '—'}</td>
                      <td style={tdStyle}>{r.clientLabel}</td>
                      <td style={tdStyle}>{r.country}</td>
                      <td style={tdStyle}>{r.city}</td>
                      <td style={tdStyle}>{r.eventLabel}</td>
                      <td style={tdStyle}>{r.document_type}</td>
                      <td style={tdStyle} title={r.sourceComment || ''}>{r.sourceLabel}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: colors.inkPlum }}>{fmt(r.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: colors.inkPlum }}>{value}</div>
    </div>
  )
}

const inputStyle = {
  border: `1px solid ${colors.lineGray}`,
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  fontFamily: fonts.body,
  background: '#fff',
}

const btnPrimary = {
  border: 'none',
  borderRadius: 8,
  padding: '9px 12px',
  background: colors.inkPlum,
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: fonts.body,
  cursor: 'pointer',
}

const btnDanger = {
  border: '1px solid #fecaca',
  borderRadius: 8,
  padding: '9px 12px',
  background: '#fef2f2',
  color: '#dc2626',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: fonts.body,
  cursor: 'pointer',
}

const thStyle = {
  padding: '10px 12px',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#888',
  textAlign: 'left',
  background: '#faf8fc',
  borderBottom: `1px solid ${colors.lineGray}`,
}

const tdStyle = {
  padding: '10px 12px',
  fontSize: 12,
  color: colors.charcoal,
  borderBottom: `1px solid ${colors.lineGray}`,
}
