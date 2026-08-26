'use client'

import { useCallback, useEffect, useState } from 'react'
import { colors, fonts } from '@/lib/styles'

const MEMO_TYPE_FILTERS = [
  { id: 'Agent', label: 'Agent' },
  { id: 'Party', label: 'Party' },
  { id: 'Internal', label: 'Internal' },
]

const fmtAmount = (n) => {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n))
}

const segmentStyle = (selected) => ({
  flex: '1 0 auto',
  minHeight: 36,
  padding: '7px 14px',
  border: 'none',
  borderRadius: 8,
  background: selected ? '#fff' : 'transparent',
  color: selected ? colors.inkPlum : colors.lovelabMuted,
  boxShadow: selected ? '0 1px 4px rgba(74,37,69,0.12)' : 'none',
  fontFamily: fonts.body,
  fontSize: 12,
  fontWeight: selected ? 700 : 600,
  cursor: selected ? 'default' : 'pointer',
  whiteSpace: 'nowrap',
})

export default function AdminOutMemosPage() {
  const [memoType, setMemoType] = useState('Agent')
  const [memos, setMemos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedNo, setSelectedNo] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const fetchMemos = useCallback(async () => {
    setLoading(true)
    setError('')
    setSelectedNo(null)
    setDetail(null)
    try {
      const qs = new URLSearchParams({ memo_type: memoType })
      const res = await fetch(`/api/admin/out-memos?${qs.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load out memos')
      setMemos(data.memos || [])
    } catch (err) {
      setError(err.message || 'Failed to load out memos')
      setMemos([])
    } finally {
      setLoading(false)
    }
  }, [memoType])

  useEffect(() => {
    fetchMemos()
  }, [fetchMemos])

  const openDetail = async (memoNo) => {
    if (selectedNo === memoNo) {
      setSelectedNo(null)
      setDetail(null)
      return
    }
    setSelectedNo(memoNo)
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    try {
      const qs = new URLSearchParams({ memo_type: memoType })
      const res = await fetch(`/api/admin/out-memos/${encodeURIComponent(memoNo)}?${qs}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load memo detail')
      setDetail(data.memo || null)
    } catch (err) {
      setDetailError(err.message || 'Failed to load memo detail')
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', fontFamily: fonts.body }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <section style={{ marginBottom: 22 }}>
          <h1 style={{
            margin: 0,
            color: colors.inkPlum,
            fontFamily: fonts.heading,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.015em',
          }}>
            Out Memos
          </h1>
          <p style={{ margin: '5px 0 0', color: colors.lovelabMuted, fontSize: 13 }}>
            Open jewellery memos from ERP — same as Laravel Out Memo group view
          </p>
        </section>

        <div
          role="tablist"
          aria-label="Memo type filter"
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            maxWidth: 360,
            marginBottom: 18,
            border: `1px solid ${colors.lovelabBorder}`,
            borderRadius: 12,
            background: '#f6f1f5',
            overflowX: 'auto',
          }}
        >
          {MEMO_TYPE_FILTERS.map((tab) => {
            const selected = memoType === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMemoType(tab.id)}
                style={segmentStyle(selected)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {error && (
          <div role="alert" style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', color: colors.danger, fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: colors.lovelabMuted, fontSize: 13 }}>Loading out memos…</p>
        ) : memos.length === 0 ? (
          <p style={{ color: colors.lovelabMuted, fontSize: 13 }}>No open out memos for this filter.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {memos.map((memo) => {
              const open = selectedNo === memo.memo_no
              return (
                <article
                  key={memo.memo_no}
                  style={{
                    border: `1px solid ${colors.lineGray}`,
                    borderRadius: 12,
                    background: '#fff',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openDetail(memo.memo_no)}
                    aria-expanded={open}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '16px 18px',
                      border: 'none',
                      background: open ? '#faf7f9' : '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: fonts.body,
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', minWidth: 0 }}>
                      <span style={{ color: '#0A5D70', fontWeight: 700, fontSize: 13 }}>
                        Memo No : {memo.memo_no}
                      </span>
                      <span style={{ color: '#0A5D70', fontWeight: 700, fontSize: 13 }}>
                        Bill No : {memo.bill_no || '—'}
                      </span>
                      <span style={{ color: '#a33939b3', fontWeight: 700, fontSize: 13 }}>
                        Party : {memo.party || '—'}
                      </span>
                      <span style={{ color: '#249150', fontWeight: 700, fontSize: 13 }}>
                        Amount : {fmtAmount(memo.amount)}
                      </span>
                    </div>
                    <svg
                      aria-hidden="true"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={colors.lovelabMuted}
                      strokeWidth="1.8"
                      style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>

                  {open && (
                    <div style={{ borderTop: `1px solid ${colors.lineGray}`, padding: '14px 18px 18px' }}>
                      {detailLoading && (
                        <p style={{ margin: 0, color: colors.lovelabMuted, fontSize: 12 }}>Loading details…</p>
                      )}
                      {detailError && (
                        <p role="alert" style={{ margin: 0, color: colors.danger, fontSize: 12 }}>{detailError}</p>
                      )}
                      {!detailLoading && !detailError && detail && (
                        <>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginBottom: 12, color: colors.lovelabMuted, fontSize: 12 }}>
                            <span>Type: {detail.memo_type || '—'}</span>
                            <span>Date: {detail.date || '—'}</span>
                            <span>Currency: {detail.currency || '—'}</span>
                            <span>Lines: {detail.lines?.length ?? 0}</span>
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ textAlign: 'left', color: colors.lovelabMuted }}>
                                  <th style={thStyle}>SKU</th>
                                  <th style={thStyle}>Type</th>
                                  <th style={thStyle}>Pcs</th>
                                  <th style={thStyle}>Carat</th>
                                  <th style={thStyle}>Rate</th>
                                  <th style={thStyle}>Amount</th>
                                  <th style={thStyle}>Category</th>
                                  <th style={thStyle}>Metal</th>
                                  <th style={thStyle}>Color</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(detail.lines || []).map((line) => (
                                  <tr key={line.id} style={{ borderTop: `1px solid ${colors.lineGray}` }}>
                                    <td style={tdStyle}>{line.sku || '—'}</td>
                                    <td style={tdStyle}>{line.type || '—'}</td>
                                    <td style={tdStyle}>{line.pcs ?? '—'}</td>
                                    <td style={tdStyle}>{line.weight ?? '—'}</td>
                                    <td style={tdStyle}>{fmtAmount(line.rate)}</td>
                                    <td style={tdStyle}>{fmtAmount(line.amount)}</td>
                                    <td style={tdStyle}>{line.production_product_category || '—'}</td>
                                    <td style={tdStyle}>{line.production_metal || '—'}</td>
                                    <td style={tdStyle}>{line.production_color || line.color || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const thStyle = {
  padding: '6px 8px 8px 0',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '8px 8px 8px 0',
  color: colors.charcoal,
  whiteSpace: 'nowrap',
}
