'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { safeFetch } from '@/lib/api'
import { normalizeCountry } from '@/lib/countries'

// ─── Column config ─────────────────────────────────────────────────────────

const ALL_COLUMNS = ['Date', 'Client', 'Country', 'City', 'Event', 'Type', 'Source', 'Amount']

// Map column label → row field
function getCellValue(row, col) {
  switch (col) {
    case 'Date':   return row.dateISO || '—'
    case 'Client': return row.clientLabel
    case 'Country': return row.country
    case 'City':   return row.city
    case 'Event':  return row.eventLabel
    case 'Type':   return row.document_type
    case 'Source': return row.sourceLabel
    case 'Amount': return row.amount != null ? String(row.amount) : '0'
    default: return ''
  }
}

// RFC 4180 CSV escape
function csvCell(val) {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
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
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  // Column visibility — default all visible
  const [visibleColumns, setVisibleColumns] = useState(new Set(ALL_COLUMNS))
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef(null)

  // Close column menu on outside click
  useEffect(() => {
    if (!colMenuOpen) return
    const handler = (e) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target)) {
        setColMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colMenuOpen])

  const toggleColumn = (col) => {
    setVisibleColumns(prev => {
      if (prev.has(col) && prev.size === 1) return prev // keep at least one
      const next = new Set(prev)
      next.has(col) ? next.delete(col) : next.add(col)
      return next
    })
  }

  const activeColumns = ALL_COLUMNS.filter(c => visibleColumns.has(c))

  const loadReports = async () => {
    setLoading(true)
    setError(null)
    try {
      const [docsRes, eventsRes, reportsRes, clientsRes] = await Promise.all([
        safeFetch('/api/documents'),
        safeFetch('/api/events'),
        safeFetch('/api/reports'),
        safeFetch('/api/clients'),
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

  useEffect(() => { loadReports() }, [])

  const documentRows = useMemo(() => {
    // Internal (supplier) orders are excluded from the reports view — they live in the Internal Orders tab
    return documents.filter(d => d.order_channel !== 'internal').map((d) => ({
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

  useEffect(() => { setPage(0) }, [filters])

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

  const exportCSV = () => {
    const header = activeColumns.map(csvCell).join(',')
    const rows = filteredRows.map(r =>
      activeColumns.map(col => {
        if (col === 'Amount') return csvCell(r.amount != null ? r.amount.toFixed(2) : '0')
        return csvCell(getCellValue(r, col))
      }).join(',')
    )
    const csv = [header, ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lovelab-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const applySavedReport = (reportId) => {
    setSelectedReportId(reportId)
    const report = reports.find((r) => r.id === reportId)
    if (!report) return
    const cfg = report.config || {}
    setFilters({ ...initialFilters, ...cfg })
    // Restore saved column visibility if present (fall back to all columns)
    if (Array.isArray(cfg.visibleColumns) && cfg.visibleColumns.length > 0) {
      setVisibleColumns(new Set(cfg.visibleColumns.filter(c => ALL_COLUMNS.includes(c))))
    } else {
      setVisibleColumns(new Set(ALL_COLUMNS))
    }
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
          // Include current column visibility in the saved config
          config: { ...filters, visibleColumns: [...visibleColumns] },
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
          <div style={{ marginBottom: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {error}
            <button onClick={loadReports} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>Retry</button>
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Column visibility toggle */}
            <div ref={colMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setColMenuOpen(v => !v)}
                style={{
                  ...btnPrimary,
                  background: colMenuOpen ? colors.inkPlum : '#fff',
                  color: colMenuOpen ? '#fff' : colors.inkPlum,
                  border: `1px solid ${colors.inkPlum}`,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
                Columns {visibleColumns.size < ALL_COLUMNS.length && `(${visibleColumns.size}/${ALL_COLUMNS.length})`}
              </button>
              {colMenuOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: '#fff', border: `1px solid ${colors.lineGray}`,
                  borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  padding: '8px 4px', zIndex: 200, minWidth: 160,
                }}>
                  {ALL_COLUMNS.map(col => (
                    <label key={col} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 14px', cursor: 'pointer', fontSize: 13,
                      color: visibleColumns.has(col) ? colors.inkPlum : '#666',
                      fontWeight: visibleColumns.has(col) ? 600 : 400,
                    }}>
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(col)}
                        disabled={visibleColumns.has(col) && visibleColumns.size === 1}
                        onChange={() => toggleColumn(col)}
                        style={{ accentColor: colors.inkPlum }}
                      />
                      {col}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Export CSV */}
            <button
              onClick={exportCSV}
              style={{
                ...btnPrimary,
                background: '#fff',
                color: colors.inkPlum,
                border: `1px solid ${colors.inkPlum}`,
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        {(() => {
          const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
          const pagedRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
          const showingFrom = filteredRows.length === 0 ? 0 : page * PAGE_SIZE + 1
          const showingTo = Math.min((page + 1) * PAGE_SIZE, filteredRows.length)
          return (
            <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 12, color: '#777', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{filteredRows.length} result{filteredRows.length !== 1 ? 's' : ''}{filteredRows.length > PAGE_SIZE ? ` — showing ${showingFrom}–${showingTo}` : ''}</span>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ ...paginationBtn, opacity: page === 0 ? 0.4 : 1 }}>Prev</button>
                    <span style={{ fontSize: 11, color: '#999' }}>Page {page + 1} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ ...paginationBtn, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>Next</button>
                  </div>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {activeColumns.map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.length === 0 ? (
                      <tr>
                        <td colSpan={activeColumns.length} style={{ padding: 30, textAlign: 'center', color: '#999', fontSize: 13 }}>No results for current filters.</td>
                      </tr>
                    ) : (
                      pagedRows.map((r) => (
                        <tr key={r.id}>
                          {activeColumns.map(col => {
                            if (col === 'Amount') {
                              return <td key={col} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: colors.inkPlum }}>{fmt(r.amount)}</td>
                            }
                            if (col === 'Source') {
                              return <td key={col} style={tdStyle} title={r.sourceComment || ''}>{r.sourceLabel}</td>
                            }
                            return <td key={col} style={tdStyle}>{getCellValue(r, col)}</td>
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div style={{ padding: '10px 14px', borderTop: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ ...paginationBtn, opacity: page === 0 ? 0.4 : 1 }}>Prev</button>
                  <span style={{ fontSize: 11, color: '#999' }}>Page {page + 1} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ ...paginationBtn, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>Next</button>
                </div>
              )}
            </div>
          )
        })()}
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

const paginationBtn = {
  padding: '5px 12px',
  borderRadius: 6,
  border: `1px solid ${colors.lineGray}`,
  background: '#fff',
  color: colors.charcoal,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: fonts.body,
}
