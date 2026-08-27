'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import {
  ALL_OUT_MEMO_TYPES,
  fmtAmount,
  memoTypesToFetch,
  mergeMemoLists,
  staysInCurrentFilter,
} from '@/lib/outMemos'

const MEMO_TYPE_FILTERS = [
  { id: 'Agent', label: 'Agent' },
  { id: 'Party', label: 'Party' },
  { id: 'Internal', label: 'Internal' },
]

const DROP_TYPES = [...ALL_OUT_MEMO_TYPES]

const VIEW_MODES = [
  { id: 'flat', label: 'List View' },
  { id: 'party', label: 'Group View' },
]

const DRAG_MIME = 'application/x-lovelab-party'

const segmentStyle = (selected, dropActive = false) => ({
  flex: '1 0 auto',
  minHeight: 36,
  padding: '7px 14px',
  border: dropActive ? `2px solid ${colors.inkPlum}` : '2px solid transparent',
  borderRadius: 8,
  background: dropActive ? '#efe6ed' : selected ? '#fff' : 'transparent',
  color: selected || dropActive ? colors.inkPlum : colors.lovelabMuted,
  boxShadow: selected ? '0 1px 4px rgba(74,37,69,0.12)' : 'none',
  fontFamily: fonts.body,
  fontSize: 12,
  fontWeight: selected || dropActive ? 700 : 600,
  cursor: selected ? 'default' : 'pointer',
  whiteSpace: 'nowrap',
})

const Chevron = ({ open }) => (
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
)

function MemoDetailPanel({ detailLoading, detailError, detail }) {
  if (detailLoading) {
    return <p style={{ margin: 0, color: colors.lovelabMuted, fontSize: 12 }}>Loading details…</p>
  }
  if (detailError) {
    return <p role="alert" style={{ margin: 0, color: colors.danger, fontSize: 12 }}>{detailError}</p>
  }
  if (!detail) return null

  return (
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
  )
}

function MemoCard({
  memo,
  open,
  onToggle,
  detailLoading,
  detailError,
  detail,
  nested = false,
  onPartyDragStart,
}) {
  const dragParty = memo.party || ''
  return (
    <article
      draggable={Boolean(dragParty)}
      onDragStart={(e) => {
        if (!dragParty) return
        e.dataTransfer.setData(DRAG_MIME, dragParty)
        e.dataTransfer.setData('text/plain', dragParty)
        e.dataTransfer.effectAllowed = 'move'
        onPartyDragStart?.(dragParty)
      }}
      onDragEnd={() => onPartyDragStart?.(null)}
      style={{
        border: `1px solid ${colors.lineGray}`,
        borderRadius: nested ? 10 : 12,
        background: '#fff',
        overflow: 'hidden',
        marginLeft: nested ? 12 : 0,
        cursor: dragParty ? 'grab' : 'default',
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(memo.memo_no)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: nested ? '12px 14px' : '16px 18px',
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
          {!nested && (
            <span style={{ color: '#a33939b3', fontWeight: 700, fontSize: 13 }}>
              Party : {memo.party || '—'}
            </span>
          )}
          <span style={{ color: '#249150', fontWeight: 700, fontSize: 13 }}>
            Amount : {fmtAmount(memo.amount)}
          </span>
        </div>
        <Chevron open={open} />
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${colors.lineGray}`, padding: nested ? '12px 14px 14px' : '14px 18px 18px' }}>
          <MemoDetailPanel detailLoading={detailLoading} detailError={detailError} detail={detail} />
        </div>
      )}
    </article>
  )
}

export default function AdminOutMemosPage() {
  const [memoType, setMemoType] = useState('Agent')
  const [viewMode, setViewMode] = useState('party')
  const [memos, setMemos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [expandedParty, setExpandedParty] = useState(null)
  const [selectedNo, setSelectedNo] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [draggingParty, setDraggingParty] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [savingType, setSavingType] = useState(false)
  const dragDepth = useRef({})
  const skipClickAfterDrop = useRef(false)

  const fetchMemos = useCallback(async () => {
    setLoading(true)
    setError('')
    setExpandedParty(null)
    setSelectedNo(null)
    setDetail(null)
    try {
      // Party is everyone — pull Agent + Party + Internal and merge.
      const lists = await Promise.all(memoTypesToFetch(memoType).map(async (type) => {
        const qs = new URLSearchParams({ memo_type: type })
        const res = await fetch(`/api/admin/out-memos?${qs.toString()}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Failed to load out memos')
        return (data.memos || []).map((m) => ({ ...m, memo_type: m.memo_type || type }))
      }))
      setMemos(mergeMemoLists(lists))
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

  const partyGroups = useMemo(() => {
    const map = new Map()
    for (const memo of memos) {
      const key = memo.party || 'Unknown party'
      if (!map.has(key)) {
        map.set(key, { party: key, memos: [], amount: 0, memo_type: memo.memo_type })
      }
      const group = map.get(key)
      group.memos.push(memo)
      group.amount += Number(memo.amount) || 0
    }
    return [...map.values()].sort((a, b) => a.party.localeCompare(b.party))
  }, [memos])

  const totalAmount = useMemo(
    () => memos.reduce((sum, memo) => sum + (Number(memo.amount) || 0), 0),
    [memos],
  )

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
      const row = memos.find((m) => m.memo_no === memoNo)
      const qs = new URLSearchParams({ memo_type: row?.memo_type || memoType })
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

  const toggleParty = (party) => {
    setExpandedParty((prev) => (prev === party ? null : party))
    setSelectedNo(null)
    setDetail(null)
  }

  const handleViewMode = (mode) => {
    setViewMode(mode)
    setExpandedParty(null)
    setSelectedNo(null)
    setDetail(null)
  }

  const assignPartyType = async (party, nextType) => {
    if (!party || !DROP_TYPES.includes(nextType) || savingType) return
    setSavingType(true)
    setStatus('')
    setError('')
    try {
      const res = await fetch('/api/admin/out-memos/party-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ party, memo_type: nextType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to update party type')

      setStatus(`Updated “${party}” → ${nextType}`)

      // Agent / Internal are filtered lists — drop the party when it leaves.
      // Party is everyone, so the card stays and only the type label changes.
      if (!staysInCurrentFilter(memoType, nextType)) {
        setMemos((prev) => {
          if (selectedNo) {
            const selected = prev.find((m) => m.memo_no === selectedNo)
            if (selected && (selected.party || '') === party) {
              setSelectedNo(null)
              setDetail(null)
            }
          }
          return prev.filter((m) => (m.party || '') !== party)
        })
        if (expandedParty === party) setExpandedParty(null)
      } else {
        setMemos((prev) => prev.map((m) => (
          (m.party || '') === party ? { ...m, memo_type: nextType } : m
        )))
      }
    } catch (err) {
      setError(err.message || 'Failed to update party type')
    } finally {
      setSavingType(false)
      setDraggingParty(null)
      setDropTarget(null)
    }
  }

  const onDropType = (type, e) => {
    e.preventDefault()
    const party = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain') || draggingParty
    setDropTarget(null)
    dragDepth.current[type] = 0
    if (party) assignPartyType(party, type)
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
            Party lists everyone. Drag a company onto Agent or Internal to classify it.
          </p>
        </section>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div
            role="tablist"
            aria-label="Memo type filter"
            style={{
              display: 'flex',
              gap: 4,
              padding: 4,
              maxWidth: 360,
              border: `1px solid ${colors.lovelabBorder}`,
              borderRadius: 12,
              background: '#f6f1f5',
              overflowX: 'auto',
            }}
          >
            {MEMO_TYPE_FILTERS.map((tab) => {
              const selected = memoType === tab.id
              const isDrop = DROP_TYPES.includes(tab.id)
              const dropActive = isDrop && dropTarget === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    if (skipClickAfterDrop.current) {
                      skipClickAfterDrop.current = false
                      return
                    }
                    setMemoType(tab.id)
                  }}
                  onDragEnter={(e) => {
                    if (!isDrop) return
                    e.preventDefault()
                    dragDepth.current[tab.id] = (dragDepth.current[tab.id] || 0) + 1
                    setDropTarget(tab.id)
                  }}
                  onDragOver={(e) => {
                    if (!isDrop) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                  }}
                  onDragLeave={() => {
                    if (!isDrop) return
                    dragDepth.current[tab.id] = Math.max(0, (dragDepth.current[tab.id] || 0) - 1)
                    if (!dragDepth.current[tab.id]) {
                      setDropTarget((prev) => (prev === tab.id ? null : prev))
                    }
                  }}
                  onDrop={(e) => {
                    if (!isDrop) return
                    skipClickAfterDrop.current = true
                    onDropType(tab.id, e)
                  }}
                  style={segmentStyle(selected, dropActive)}
                  title={isDrop ? 'Drop a party here to set memo type' : undefined}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div
            role="tablist"
            aria-label="View mode"
            style={{
              display: 'flex',
              gap: 4,
              padding: 4,
              border: `1px solid ${colors.lovelabBorder}`,
              borderRadius: 12,
              background: '#f6f1f5',
              overflowX: 'auto',
            }}
          >
            {VIEW_MODES.map((tab) => {
              const selected = viewMode === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => handleViewMode(tab.id)}
                  style={segmentStyle(selected)}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {!loading && memos.length > 0 && (
          <p data-testid="out-memos-total" style={{ margin: '0 0 14px', color: '#249150', fontSize: 16, fontWeight: 700 }}>
            Total Amount : {fmtAmount(totalAmount)}
            <span style={{ marginLeft: 12, color: colors.lovelabMuted, fontSize: 13, fontWeight: 600 }}>
              ({memos.length} memo{memos.length === 1 ? '' : 's'})
            </span>
          </p>
        )}

        {draggingParty && (
          <p style={{ margin: '0 0 12px', color: colors.inkPlum, fontSize: 12, fontWeight: 600 }}>
            Drop “{draggingParty}” on Agent, Party, or Internal
            {savingType ? ' — saving…' : ''}
          </p>
        )}

        {status && (
          <div role="status" style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: '#f0fdf4', color: '#166534', fontSize: 13 }}>
            {status}
          </div>
        )}

        {error && (
          <div role="alert" style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', color: colors.danger, fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: colors.lovelabMuted, fontSize: 13 }}>Loading out memos…</p>
        ) : memos.length === 0 ? (
          <p style={{ color: colors.lovelabMuted, fontSize: 13 }}>No open out memos for this filter.</p>
        ) : viewMode === 'flat' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {memos.map((memo) => (
              <MemoCard
                key={memo.memo_no}
                memo={memo}
                open={selectedNo === memo.memo_no}
                onToggle={openDetail}
                detailLoading={detailLoading && selectedNo === memo.memo_no}
                detailError={selectedNo === memo.memo_no ? detailError : ''}
                detail={selectedNo === memo.memo_no ? detail : null}
                onPartyDragStart={setDraggingParty}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {partyGroups.map((group) => {
              const partyOpen = expandedParty === group.party
              return (
                <article
                  key={group.party}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, group.party)
                    e.dataTransfer.setData('text/plain', group.party)
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggingParty(group.party)
                  }}
                  onDragEnd={() => setDraggingParty(null)}
                  style={{
                    border: `1px solid ${colors.lineGray}`,
                    borderRadius: 12,
                    background: '#fff',
                    overflow: 'hidden',
                    cursor: 'grab',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleParty(group.party)}
                    aria-expanded={partyOpen}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '16px 18px',
                      border: 'none',
                      background: partyOpen ? '#faf7f9' : '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: fonts.body,
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', minWidth: 0 }}>
                      <span style={{ color: '#a33939b3', fontWeight: 700, fontSize: 14 }}>
                        Party : {group.party}
                      </span>
                      <span style={{ color: colors.lovelabMuted, fontWeight: 600, fontSize: 13 }}>
                        Memos : {group.memos.length}
                      </span>
                      <span data-testid="out-memos-group-amount" style={{ color: '#249150', fontWeight: 700, fontSize: 13 }}>
                        Amount : {fmtAmount(group.amount)}
                      </span>
                      {group.memo_type && (
                        <span style={{ color: colors.inkPlum, fontWeight: 600, fontSize: 12 }}>
                          Type : {group.memo_type}
                        </span>
                      )}
                    </div>
                    <Chevron open={partyOpen} />
                  </button>

                  {partyOpen && (
                    <div style={{ borderTop: `1px solid ${colors.lineGray}`, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {group.memos.map((memo) => (
                        <MemoCard
                          key={memo.memo_no}
                          memo={memo}
                          nested
                          open={selectedNo === memo.memo_no}
                          onToggle={openDetail}
                          detailLoading={detailLoading && selectedNo === memo.memo_no}
                          detailError={selectedNo === memo.memo_no ? detailError : ''}
                          detail={selectedNo === memo.memo_no ? detail : null}
                          onPartyDragStart={setDraggingParty}
                        />
                      ))}
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
