'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts, card, btn } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, visitRef, sameDayLabel } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import { VISIT_LABELS, VISIT_TONES } from '@/lib/igi/visits'
import Chip from './igi/Chip'

/** Every movement, newest first. */
export default function CertificatesVisitsClient() {
  const router = useRouter()
  const { isCompact } = useResponsive()
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/visits')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the movements')
      setVisits(body.visits || [])
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

  const open = visits.filter((v) => v.status !== 'closed')

  return (
    <div style={{ padding: isCompact ? 16 : 28, fontFamily: fonts.body, maxWidth: 1180 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: fonts.heading, fontSize: isCompact ? 24 : 30, margin: 0, color: colors.text }}>
            Visits
          </h1>
          <p style={{ margin: '4px 0 0', color: colors.textLight, fontSize: 13 }}>
            {visits.length} movement{visits.length === 1 ? '' : 's'}
            {open.length ? `, ${open.length} still open` : ', all closed'}.
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/certificates/requests')}
          data-testid="new-request"
          style={{ ...btn.primary, marginLeft: 'auto' }}
        >
          New request
        </button>
      </div>

      {error && (
        <div style={{ ...banner, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={dismiss} data-testid="dismiss-error">Dismiss</button>
        </div>
      )}

      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={th}>Movement</th>
              <th style={th}>Date</th>
              <th style={th}>Where it is</th>
              <th style={thNum}>Models</th>
              <th style={thNum}>Certificates</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr
                key={v.id}
                onClick={() => router.push(`/admin/certificates/visits/${v.id}`)}
                data-testid="visit-row"
                style={{ cursor: 'pointer' }}
              >
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
                    <div style={{ marginTop: 3 }}>
                      <Chip tone="gap">Date mistyped in the file</Chip>
                    </div>
                  )}
                </td>
                <td style={td}><Chip tone={VISIT_TONES[v.status]}>{VISIT_LABELS[v.status]}</Chip></td>
                <td style={tdNum}>
                  {v.unattributed_total != null
                    ? <span style={{ color: colors.textMuted, fontSize: 12 }}>no breakdown</span>
                    : formatQty(v.line_count)}
                </td>
                <td style={tdNum}>{formatQty(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {visits.length === 0 && (
          <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: 13 }}>
            No movements yet. Start with a new request.
          </p>
        )}
      </div>

      <p style={{ marginTop: 14, fontSize: 12, color: colors.textMuted, maxWidth: 720, lineHeight: 1.6 }}>
        A movement marked <em>no breakdown</em> is one IGI recorded as a daily total without the
        models, between 16 June and 28 July 2026. Its certificates are counted but belong to no
        model. Four movements also carry a mistyped year; the date is kept exactly as written and
        the reporting month is taken from the movement before it.
      </p>
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
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10,
  fontSize: 13, marginBottom: 16,
}
const dismiss = {
  background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline',
  cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
}
