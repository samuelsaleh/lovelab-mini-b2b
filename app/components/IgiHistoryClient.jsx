'use client'

import { useState, useEffect } from 'react'
import { colors, fonts, card, btn } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, visitRef, sameDayLabel } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import { VISIT_LABELS, VISIT_TONES } from '@/lib/igi/visits'
import Chip from './igi/Chip'

/** What has already happened. Read only. */
export default function IgiHistoryClient() {
  const { isCompact } = useResponsive()
  const [visits, setVisits] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('visits')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi-portal/history')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not load the history')
      setVisits(body.visits || [])
      setBatches(body.batches || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ padding: isCompact ? 16 : 28, fontFamily: fonts.body, maxWidth: 900 }}>
      <h1 style={{ fontFamily: fonts.heading, fontSize: isCompact ? 24 : 30, margin: 0, color: colors.text }}>
        History
      </h1>
      <p style={{ margin: '4px 0 20px', color: colors.textLight, fontSize: 13 }}>
        {visits.length} movements and {batches.length} production batches.
      </p>

      {error && (
        <div style={{ ...banner, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['visits', `Movements (${visits.length})`], ['batches', `Batches (${batches.length})`]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            data-testid={`tab-${id}`}
            style={{
              ...btn.secondary, padding: '6px 14px', fontSize: 12,
              background: tab === id ? colors.inkPlum : '#fff',
              color: tab === id ? '#fff' : colors.inkPlum,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ ...card, overflowX: 'auto' }}>
        {tab === 'visits' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>Movement</th>
                <th style={th}>Date</th>
                <th style={th}>Where it is</th>
                <th style={thNum}>Certificates</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id} data-testid="history-visit">
                  <td style={{ ...td, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, fontWeight: 600 }}>
                    {visitRef(v)}
                    {sameDayLabel(v, visits) && (
                      <span style={{ marginLeft: 6, color: colors.textMuted, fontWeight: 400 }}>
                        {sameDayLabel(v, visits)}
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    {formatDate(v.visit_date)}
                    {v.date_suspect && (
                      <div style={{ marginTop: 3 }}><Chip tone="gap">Date mistyped</Chip></div>
                    )}
                  </td>
                  <td style={td}><Chip tone={VISIT_TONES[v.status]}>{VISIT_LABELS[v.status]}</Chip></td>
                  <td style={tdNum}>
                    {formatQty(v.total)}
                    {v.unattributed_total != null && (
                      <div style={{ fontSize: 11, color: colors.textMuted }}>no models recorded</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>Model</th>
                <th style={th}>Serial</th>
                <th style={th}>Date made</th>
                <th style={th}>Your reference</th>
                <th style={thNum}>How many</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} data-testid="history-batch">
                  <td style={{ ...td, fontSize: 13, fontWeight: 600 }}>{b.name}</td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{b.serial}</td>
                  <td style={td}>{formatDate(b.batch_date)}</td>
                  <td style={{ ...td, fontSize: 12, color: colors.textLight }}>{b.reference || '—'}</td>
                  <td style={tdNum}>{formatQty(b.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const th = {
  textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase',
  letterSpacing: '0.04em', fontWeight: 700, color: colors.textMuted,
  borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap',
}
const thNum = { ...th, textAlign: 'right' }
const td = { padding: '10px 12px', borderBottom: `1px solid ${colors.borderLight}`, verticalAlign: 'top' }
const tdNum = { ...td, textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap' }
const banner = {
  padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16,
}
