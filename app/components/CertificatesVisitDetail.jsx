'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts, card, btn, inputSm } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, visitRef } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import { VISIT_LABELS, VISIT_TONES } from '@/lib/igi/visits'
import SerialSpec from './igi/SerialSpec'
import Chip from './igi/Chip'
import Pipeline, { stepForStatus } from './igi/Pipeline'

/**
 * One movement, end to end.
 *
 * Receiving is one button: everything IGI made is taken as having come back. A
 * per-line figure only appears when somebody says something is short, because
 * naming every model on every return is the paperwork this replaces.
 */
export default function CertificatesVisitDetail({ visitId }) {
  const { isCompact } = useResponsive()
  const [visit, setVisit] = useState(null)
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [made, setMade] = useState({})
  const [shortReturn, setShortReturn] = useState(false)
  const [back, setBack] = useState({})

  useEffect(() => { load() }, [visitId])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/igi/visits/${visitId}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the movement')
      setVisit(body.visit)
      setLines(body.lines || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function post(path, payload, message) {
    setSaving(true)
    try {
      const res = await fetch(`/api/igi/visits/${visitId}/${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Something went wrong')
      setNotice(typeof message === 'function' ? message(body) : message)
      setTimeout(() => setNotice(null), 6000)
      setShortReturn(false)
      setBack({})
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const short = useMemo(() => lines.filter((l) => l.short_by > 0), [lines])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading...
      </div>
    )
  }
  if (!visit) {
    return (
      <div style={{ padding: 28, fontFamily: fonts.body }}>
        <div style={{ ...banner, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          {error || 'That movement does not exist.'}
        </div>
      </div>
    )
  }

  const totalAsked = lines.reduce((t, l) => t + l.qty_requested, 0)
  const totalMade = lines.reduce((t, l) => t + (l.qty_issued ?? 0), 0)
  const totalBack = lines.reduce((t, l) => t + (l.qty_received ?? 0), 0)

  return (
    <div style={{ padding: isCompact ? 16 : 28, fontFamily: fonts.body, maxWidth: 1180 }}>
      <h1 style={{ fontFamily: fonts.heading, fontSize: isCompact ? 24 : 30, margin: 0, color: colors.text }}>
        {visitRef(visit)}
        {visit.same_day_total && (
          <span style={{ fontSize: 15, fontWeight: 400, color: colors.textMuted, marginLeft: 10 }}>
            {visit.same_day_position} of {visit.same_day_total} that day
          </span>
        )}
      </h1>
      <p style={{ margin: '4px 0 20px', color: colors.textLight, fontSize: 13, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{formatDate(visit.visit_date)}</span>
        <Chip tone={VISIT_TONES[visit.status]}>{VISIT_LABELS[visit.status]}</Chip>
        {visit.date_suspect && <Chip tone="gap">Date mistyped in the file</Chip>}
      </p>

      <Pipeline active={stepForStatus(visit.status)} title="Where this movement is" />

      {error && (
        <div style={{ ...banner, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={dismiss} data-testid="dismiss-error">Dismiss</button>
        </div>
      )}
      {notice && (
        <div style={{ ...banner, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }} data-testid="notice">
          {notice}
        </div>
      )}

      {visit.unattributed_total != null && (
        <div style={{ ...card, padding: 16, marginBottom: 18, borderLeft: '3px solid #6d28d9' }} data-testid="no-breakdown">
          <strong style={{ fontSize: 14 }}>
            {formatQty(visit.unattributed_total)} certificates, no models recorded
          </strong>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.textLight, lineHeight: 1.55 }}>
            IGI recorded this movement as a daily total only. The certificates are counted but
            belong to no model. When the detail is reconstructed it goes in here and the balances
            correct themselves.
          </p>
        </div>
      )}

      {short.length > 0 && visit.status === 'requested' && (
        <div style={{ ...banner, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', display: 'block' }} data-testid="shortage">
          <strong>IGI are short on {short.length} model{short.length > 1 ? 's' : ''}.</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }}>
            {short.map((l) => (
              <li key={l.id}>
                {l.name} — asked {formatQty(l.qty_requested)}, they hold {formatQty(l.held)},
                short by {formatQty(l.short_by)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {visit.unattributed_total == null && (
        <div style={{ ...card, overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>Model</th>
                <th style={th}>Serial · check</th>
                <th style={thNum}>Asked</th>
                <th style={thNum}>IGI hold</th>
                <th style={thNum}>Made</th>
                <th style={thNum}>Back</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} data-testid="visit-line">
                  <td style={td}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</div>
                    {l.short_by > 0 && visit.status === 'requested' && (
                      <div style={{ marginTop: 3 }}>
                        <Chip tone="watch">Short by {formatQty(l.short_by)}</Chip>
                      </div>
                    )}
                    {l.qty_issued != null && l.qty_issued < l.qty_requested && (
                      <div style={{ marginTop: 3 }}>
                        <Chip tone="watch">{formatQty(l.qty_requested - l.qty_issued)} fewer than asked</Chip>
                      </div>
                    )}
                  </td>
                  <td style={td}><SerialSpec model={l} compact /></td>
                  <td style={tdNum}>{formatQty(l.qty_requested)}</td>
                  <td style={tdNum}>{formatQty(l.held)}</td>
                  <td style={tdNum}>
                    {visit.status === 'requested' ? (
                      <input
                        type="number"
                        min="0"
                        placeholder={String(l.qty_requested)}
                        value={made[l.model_id] ?? ''}
                        onChange={(e) => setMade((m) => ({ ...m, [l.model_id]: e.target.value }))}
                        data-testid="made-qty"
                        style={{ ...inputSm, width: 84, textAlign: 'right' }}
                      />
                    ) : formatQty(l.qty_issued)}
                  </td>
                  <td style={tdNum}>
                    {visit.status === 'issued' && shortReturn ? (
                      <input
                        type="number"
                        min="0"
                        placeholder={String(l.qty_issued ?? 0)}
                        value={back[l.model_id] ?? ''}
                        onChange={(e) => setBack((b) => ({ ...b, [l.model_id]: e.target.value }))}
                        data-testid="back-qty"
                        style={{ ...inputSm, width: 84, textAlign: 'right' }}
                      />
                    ) : formatQty(l.qty_received)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Total</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{formatQty(totalAsked)}</td>
                <td style={tdNum} />
                <td style={{ ...tdNum, fontWeight: 700 }}>{totalMade ? formatQty(totalMade) : '—'}</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{totalBack ? formatQty(totalBack) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── The one action available at this step ─────────────────────────── */}
      {visit.status === 'requested' && visit.unattributed_total == null && (
        <div style={{ ...card, padding: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>What IGI made</h2>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.textLight }}>
            Leave a model blank if they made everything that was asked for. Fewer is normal.
          </p>
          <button
            onClick={() => post('issued', { issued: made }, 'Recorded. IGI’s stock has come down by that amount.')}
            disabled={saving}
            data-testid="confirm-made"
            style={{ ...btn.primary, opacity: saving ? 0.5 : 1 }}
          >
            {saving ? 'Saving…' : 'Record what they made'}
          </button>
        </div>
      )}

      {visit.status === 'issued' && (
        <div style={{ ...card, padding: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Confirm the return</h2>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.textLight }}>
            One button takes everything IGI made as having come back. Only name models if
            something is short.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => post(
                'received',
                { received: shortReturn ? back : {} },
                (body) => `Received — ${formatQty(body.received)} certificates.`,
              )}
              disabled={saving}
              data-testid="confirm-return"
              style={{ ...btn.primary, opacity: saving ? 0.5 : 1 }}
            >
              {saving ? 'Saving…' : 'Confirm the return'}
            </button>
            <button
              onClick={() => setShortReturn((v) => !v)}
              data-testid="toggle-short-return"
              style={{ ...btn.secondary, padding: '8px 16px', fontSize: 12 }}
            >
              {shortReturn ? 'Everything came back' : 'Something is short'}
            </button>
          </div>
        </div>
      )}

      {visit.status === 'closed' && (
        <p style={{ fontSize: 12, color: colors.textMuted, maxWidth: 720, lineHeight: 1.6 }}>
          This movement is closed. A correction goes in as a new movement rather than a change
          here, so the history stays honest. The certificates are not yet written into LoveLab&rsquo;s
          own software automatically — until that endpoint exists, the shelf figure still comes
          from the nightly read alone.
        </p>
      )}
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
