'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'

const fmt = (n) => {
  if (n == null || n === 0) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('all')
  const [showAllClients, setShowAllClients] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)

  const ITEMS_PER_PAGE = 30

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [clientsRes, docsRes] = await Promise.all([
        fetch('/api/clients').then(r => r.json()),
        fetch('/api/documents').then(r => r.json()),
      ])
      setClients(clientsRes.clients || [])
      setDocuments(docsRes.documents || [])
    } catch {
      setError('Failed to load data')
    }
    setLoading(false)
  }

  const docsByCompany = useMemo(() => {
    const map = {}
    for (const d of documents) {
      const key = (d.client_company || d.client_name || '').toLowerCase()
      if (!key) continue
      if (!map[key]) map[key] = { count: 0, total: 0 }
      map[key].count++
      map[key].total += Number(d.total_amount) || 0
    }
    return map
  }, [documents])

  const countries = useMemo(() => {
    const set = new Set()
    for (const c of clients) {
      if (c.country) set.add(c.country)
    }
    return [...set].sort()
  }, [clients])

  const filtered = useMemo(() => {
    let result = clients
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.company?.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      )
    }
    if (countryFilter !== 'all') {
      result = result.filter(c => c.country === countryFilter)
    }
    return result.map(c => {
      const key = (c.company || c.name || '').toLowerCase()
      const stats = docsByCompany[key] || { count: 0, total: 0 }
      return { ...c, orderCount: stats.count, orderTotal: stats.total }
    })
      .filter(c => showAllClients ? true : c.orderCount > 0)
      .sort((a, b) => b.orderTotal - a.orderTotal)
  }, [clients, search, countryFilter, docsByCompany, showAllClients])

  const paged = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE)
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)

  useEffect(() => { setPage(0) }, [search, countryFilter, showAllClients])

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>Loading...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: '0 0 20px' }}>
          Client Directory ({filtered.length})
        </h1>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by company, name, or email..."
            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: `1px solid ${colors.lineGray}`, fontSize: 13, fontFamily: fonts.body, background: '#fff' }}
          />
          <select
            value={countryFilter}
            onChange={e => setCountryFilter(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${colors.lineGray}`, fontSize: 13, fontFamily: fonts.body, background: '#fff', minWidth: 140 }}
          >
            <option value="all">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={() => setShowAllClients((v) => !v)}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: `1px solid ${showAllClients ? colors.inkPlum : colors.lineGray}`,
              background: showAllClients ? '#fdf7fa' : '#fff',
              color: showAllClients ? colors.inkPlum : '#666',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: fonts.body,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {showAllClients ? 'Only ordered clients' : 'Show all clients'}
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Company', 'Contact', 'Country', 'Email', 'Phone', 'Source', 'Orders', 'Total'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', background: '#faf8fc', borderBottom: `1px solid ${colors.lineGray}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>
                    {search || countryFilter !== 'all' ? 'No clients match your filters' : 'No clients yet'}
                  </td>
                </tr>
              ) : (
                paged.map(c => (
                  <tr key={c.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: colors.charcoal }}>{c.company || '—'}</div>
                    </td>
                    <td style={tdStyle}>{c.name || '—'}</td>
                    <td style={tdStyle}>{c.country || '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>{c.email || '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>{c.phone || '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {(c.source === 'salesforce' || c.vat === 'UNDER_SALESFORCE') ? 'Salesforce' : 'Manual'}
                      {(c.source_comment || c.vat === 'UNDER_SALESFORCE') ? (
                        <span style={{ color: colors.lovelabMuted }}> · {c.source_comment || 'Under Salesforce'}</span>
                      ) : null}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{c.orderCount || 0}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: colors.inkPlum }}>{c.orderTotal ? fmt(c.orderTotal) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 16px', borderTop: `1px solid ${colors.lineGray}` }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={pageBtnStyle(page > 0)}
              >
                Previous
              </button>
              <span style={{ fontSize: 12, color: colors.lovelabMuted, alignSelf: 'center' }}>{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={pageBtnStyle(page < totalPages - 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const tdStyle = { padding: '10px 14px', fontSize: 12, color: colors.charcoal, borderBottom: `1px solid ${colors.lineGray}` }
const pageBtnStyle = (active) => ({
  padding: '6px 14px', borderRadius: 6,
  border: `1px solid ${active ? colors.inkPlum : colors.lineGray}`,
  background: active ? '#fdf7fa' : '#f9f9f9',
  color: active ? colors.inkPlum : '#ccc',
  fontSize: 12, fontWeight: 600, cursor: active ? 'pointer' : 'default', fontFamily: fonts.body,
})
