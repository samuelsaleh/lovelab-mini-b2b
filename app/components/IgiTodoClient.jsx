'use client'

import { useState, useEffect } from 'react'
import { colors, fonts, card, btn, inputSm } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, visitRef } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import SerialSpec from './igi/SerialSpec'
import Chip from './igi/Chip'

/**
 * What LoveLab are waiting on.
 *
 * One card per request. Deliberately not a table, and deliberately not a
 * dashboard: somebody is standing at a bench with three hundred cards, and the
 * only question they need answered is how many of each to make.
 */
export default function IgiTodoClient() {
  const { isCompact } = useResponsive()
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [made, setMade] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi-portal/todo')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not load your list')
      setVisits(body.visits || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function send(visit) {
    setSavingId(visit.id)
    try {
      const res = await fetch(`/api/igi-portal/todo/${visit.id}/produce`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ made: made[visit.id] || {} }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not save what you made')
      setNotice(`Sent — ${formatQty(body.made)} certificates back to LoveLab.`)
      setTimeout(() => setNotice(null), 6000)
      setMade((m) => ({ ...m, [visit.id]: {} }))
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
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
        To do
      </h1>
      <p style={{ margin: '4px 0 20px', color: colors.textLight, fontSize: 13 }}>
        {visits.length === 0
          ? 'Nothing waiting. LoveLab have not asked for anything.'
          : `${visits.length} request${visits.length === 1 ? '' : 's'} from LoveLab.`}
      </p>

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

      {visits.length === 0 && !error && (
        <div style={{ ...card, padding: 28, textAlign: 'center', color: colors.textMuted, fontSize: 14 }} data-testid="empty">
          When LoveLab ask for certificates, the request appears here.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {visits.map((visit) => {
          const short = visit.lines.filter((l) => l.short_by > 0)
          return (
            <div key={visit.id} style={{ ...card, padding: isCompact ? 16 : 22 }} data-testid="todo-card">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, fontWeight: 700 }}>
                  {visitRef(visit)}
                </span>
                <span style={{ fontSize: 13, color: colors.textLight }}>{formatDate(visit.visit_date)}</span>
                <Chip tone="watch">Waiting on you</Chip>
              </div>

              {short.length > 0 && (
                <div
                  style={{
                    background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309',
                    borderRadius: 10, padding: '10px 14px', fontSize: 13, margin: '10px 0 14px',
                  }}
                  data-testid="shortage"
                >
                  <strong>
                    You hold fewer than they asked for on {short.length} model{short.length > 1 ? 's' : ''}.
                  </strong>
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    Make what you can — put the real number in, LoveLab will see it.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {visit.lines.map((line) => (
                  <div
                    key={line.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isCompact ? '1fr' : '1fr auto auto auto',
                      gap: isCompact ? 6 : 14,
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: line.short_by > 0 ? '#fffdf5' : colors.bgOff,
                    }}
                    data-testid="todo-line"
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{line.name}</div>
                      <SerialSpec model={line} compact />
                    </div>

                    <Figure label="They asked for" value={formatQty(line.qty_requested)} />
                    <Figure
                      label="You hold"
                      value={formatQty(line.held)}
                      tone={line.short_by > 0 ? '#b45309' : undefined}
                      note={line.short_by > 0 ? `short by ${formatQty(line.short_by)}` : null}
                    />

                    <div style={{ textAlign: isCompact ? 'left' : 'right' }}>
                      <div style={figureLabel}>You made</div>
                      <input
                        type="number"
                        min="0"
                        placeholder={String(line.qty_requested)}
                        value={made[visit.id]?.[line.model_id] ?? ''}
                        onChange={(e) => setMade((m) => ({
                          ...m,
                          [visit.id]: { ...(m[visit.id] || {}), [line.model_id]: e.target.value },
                        }))}
                        data-testid="made-qty"
                        style={{ ...inputSm, width: 92, textAlign: 'right', fontSize: 15, height: 38 }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => send(visit)}
                  disabled={savingId === visit.id}
                  data-testid="send-to-lovelab"
                  style={{ ...btn.primary, opacity: savingId === visit.id ? 0.5 : 1 }}
                >
                  {savingId === visit.id ? 'Sending…' : 'Send back to LoveLab'}
                </button>
                <span style={{ fontSize: 12, color: colors.textMuted }}>
                  Leave a model empty if you made everything they asked for.
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Figure({ label, value, note, tone }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 92 }}>
      <div style={figureLabel}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone || colors.text }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: '#b45309' }}>{note}</div>}
    </div>
  )
}

const figureLabel = {
  fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: colors.textMuted, fontWeight: 700, marginBottom: 2,
}

const banner = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10,
  fontSize: 13, marginBottom: 16,
}
const dismiss = {
  background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline',
  cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
}
