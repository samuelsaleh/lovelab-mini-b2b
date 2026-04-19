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

  const exportXLSX = async () => {
    const ExcelJSModule = await import('exceljs')
    const ExcelJS = ExcelJSModule.default || ExcelJSModule

    // ── Brand constants ──────────────────────────────────────────────────────
    const PLUM      = 'FF5D3A5E'   // inkPlum
    const PLUM_DARK = 'FF4A2545'   // lovelabDark — totals row
    const PLUM_MID  = 'FF7A4F7C'   // inkPlumLight — header border
    const WHITE     = 'FFFFFFFF'
    const LIGHT_ROW = 'FFFFF9FF'   // barely-tinted alternating row
    const TEXT_GRAY = 'FF4F4F4F'   // charcoal
    const KPI_GRAY  = 'FF8A6A7D'   // lovelabMuted

    const numCols = activeColumns.length
    const lastCol = String.fromCharCode(64 + numCols)  // e.g. "H" for 8 cols

    const wb = new ExcelJS.Workbook()
    wb.creator = 'LoveLab'
    wb.created = new Date()

    const ws = wb.addWorksheet('Report', {
      views: [{ state: 'frozen', ySplit: 7 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    })

    // ── Helper: style every cell in a row identically ────────────────────────
    const styleRow = (rowNum, fill, font, alignment) => {
      for (let c = 1; c <= numCols; c++) {
        const cell = ws.getCell(rowNum, c)
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
        if (font) cell.font = { ...font, name: 'Calibri' }
        if (alignment) cell.alignment = alignment
      }
    }

    // ── Row 1: Brand title bar ───────────────────────────────────────────────
    ws.getRow(1).height = 40
    ws.mergeCells(`A1:${lastCol}1`)
    const titleCell = ws.getCell('A1')
    titleCell.value = '✦  LoveLab'
    titleCell.font  = { bold: true, size: 18, color: { argb: WHITE }, name: 'Calibri' }
    titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } }
    titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

    // ── Row 2: Subtitle (filter context) ────────────────────────────────────
    ws.getRow(2).height = 20
    ws.mergeCells(`A2:${lastCol}2`)
    const countryLabel = filters.country !== 'all' ? filters.country : 'All Countries'
    const dateLabel    = [filters.dateFrom, filters.dateTo].filter(Boolean).join(' – ') || 'All Dates'
    const reportLabel  = selectedReportId ? reports.find(r => r.id === selectedReportId)?.name : null
    const subtitleCell = ws.getCell('A2')
    subtitleCell.value = [reportLabel, countryLabel, dateLabel].filter(Boolean).join('   ·   ')
    subtitleCell.font  = { size: 10, color: { argb: 'FFCFAECF' }, italic: true, name: 'Calibri' }
    subtitleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } }
    subtitleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

    // ── Row 3: Bottom of title band (spacer in brand color) ─────────────────
    ws.getRow(3).height = 6
    ws.mergeCells(`A3:${lastCol}3`)
    ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } }

    // ── Row 4: KPI labels ────────────────────────────────────────────────────
    ws.getRow(4).height = 16
    const kpiDefs = [
      { label: 'Total Revenue',  value: kpis.totalRevenue,   fmt: '€#,##0.00' },
      { label: 'Orders',         value: kpis.totalOrders,    fmt: null },
      { label: 'Quotes',         value: kpis.totalQuotes,    fmt: null },
      { label: 'Average Order',  value: kpis.avgOrderValue,  fmt: '€#,##0.00' },
    ]
    kpiDefs.forEach(({ label }, i) => {
      const cell = ws.getCell(4, i + 1)
      cell.value = label.toUpperCase()
      cell.font  = { size: 8, color: { argb: KPI_GRAY }, name: 'Calibri', bold: false }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7FF' } }
    })

    // ── Row 5: KPI values ────────────────────────────────────────────────────
    ws.getRow(5).height = 28
    kpiDefs.forEach(({ value, fmt }, i) => {
      const cell = ws.getCell(5, i + 1)
      cell.value = value
      if (fmt) cell.numFmt = fmt
      cell.font  = { size: 14, bold: true, color: { argb: PLUM }, name: 'Calibri' }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7FF' } }
    })

    // ── Row 6: Spacer before table ───────────────────────────────────────────
    ws.getRow(6).height = 10

    // ── Row 7: Column headers ────────────────────────────────────────────────
    ws.getRow(7).height = 26
    activeColumns.forEach((col, i) => {
      const cell = ws.getCell(7, i + 1)
      cell.value = col.toUpperCase()
      cell.font  = { bold: true, color: { argb: WHITE }, size: 9, name: 'Calibri' }
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } }
      cell.alignment = {
        horizontal: col === 'Amount' ? 'right' : 'left',
        vertical: 'middle',
        indent: col === 'Amount' ? 0 : 1,
      }
      cell.border = {
        bottom: { style: 'medium', color: { argb: PLUM_MID } },
      }
    })

    // ── Rows 8+: Data rows ───────────────────────────────────────────────────
    filteredRows.forEach((r, rowIdx) => {
      const xlRow = ws.getRow(8 + rowIdx)
      xlRow.height = 18
      const isEven = rowIdx % 2 === 0

      activeColumns.forEach((col, colIdx) => {
        const cell = ws.getCell(8 + rowIdx, colIdx + 1)
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? WHITE : LIGHT_ROW } }
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE8E8E8' } } }

        if (col === 'Amount') {
          cell.value  = r.amount != null ? r.amount : 0
          cell.numFmt = '"€"#,##0.00'
          cell.font   = { bold: true, color: { argb: PLUM }, size: 11, name: 'Calibri' }
          cell.alignment = { horizontal: 'right', vertical: 'middle' }
        } else {
          cell.value = getCellValue(r, col) || ''
          cell.font  = { size: 10, color: { argb: TEXT_GRAY }, name: 'Calibri' }
          cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
        }
      })
    })

    // ── Totals row ───────────────────────────────────────────────────────────
    const totalsRowIdx = 8 + filteredRows.length
    ws.getRow(totalsRowIdx).height = 26
    activeColumns.forEach((col, colIdx) => {
      const cell = ws.getCell(totalsRowIdx, colIdx + 1)
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } }
      cell.border = { top: { style: 'medium', color: { argb: PLUM_MID } } }

      if (col === 'Amount') {
        cell.value  = filteredRows.reduce((s, r) => s + (r.amount || 0), 0)
        cell.numFmt = '"€"#,##0.00'
        cell.font   = { bold: true, color: { argb: WHITE }, size: 12, name: 'Calibri' }
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      } else if (colIdx === 0) {
        cell.value = `TOTAL  (${filteredRows.length} rows)`
        cell.font  = { bold: true, color: { argb: WHITE }, size: 10, name: 'Calibri' }
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      } else {
        cell.value = ''
      }
    })

    // ── Column widths ────────────────────────────────────────────────────────
    const colWidths = { Date: 14, Client: 30, Country: 18, City: 18, Event: 26, Type: 12, Source: 14, Amount: 16 }
    activeColumns.forEach((col, i) => {
      ws.getColumn(i + 1).width = colWidths[col] || 16
    })

    // ── Build filename ───────────────────────────────────────────────────────
    const countrySlug = filters.country !== 'all'
      ? `_${filters.country.replace(/\s+/g, '_')}`
      : ''
    const dateSlug = new Date().toISOString().slice(0, 10)
    const filename = `LoveLab_Report${countrySlug}_${dateSlug}.xlsx`

    // ── Download ─────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer()
    const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href     = url
    a.download = filename
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

            {/* Export Excel */}
            <button
              onClick={exportXLSX}
              style={{
                ...btnPrimary,
                background: colors.inkPlum,
                color: '#fff',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/>
                <line x1="8" y1="17" x2="16" y2="17"/>
                <line x1="10" y1="9" x2="8" y2="9"/>
              </svg>
              Export Excel
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
