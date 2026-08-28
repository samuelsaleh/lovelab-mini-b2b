'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts, card, btn, inputSm } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty } from '@/lib/igi/derive'
import SerialSpec from './igi/SerialSpec'
import Chip from './igi/Chip'
import Pipeline from './igi/Pipeline'

/**
 * Choosing what to ask IGI for.
 *
 * Asking for more than IGI holds is allowed — the warning is there so nobody
 * walks across the road expecting 500 and comes back with 41.
 */
export default function CertificatesRequestClient() {
  const router = useRouter()
  const { isCompact } = useResponsive()
  const [models, setModels] = useState([])
  const [draft, setDraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/overview')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the models')
      // Only models with a serial and a quantity can be asked for.
      setModels((body.models || []).filter((m) => m.state === 'in_use'))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const chosen = useMemo(
    () => models.filter((m) => draft[m.id] > 0),
    [models, draft],
  )
  const short = useMemo(
    () => chosen.filter((m) => m.pool != null && draft[m.id] > m.pool),
    [chosen, draft],
  )
  const total = chosen.reduce((t, m) => t + draft[m.id], 0)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => `${m.name} ${m.serial} ${m.shape}`.toLowerCase().includes(q))
  }, [models, query])

  async function send() {
    setSending(true)
    try {
      const res = await fetch('/api/igi/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: chosen.map((m) => ({ model_id: m.id, qty: draft[m.id] })),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to send the request')
      router.push(`/admin/certificates/visits/${body.visit.id}`)
    } catch (err) {
      setError(err.message)
      setSending(false)
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
    <div style={{ padding: isCompact ? 16 : 28, fontFamily: fonts.body, maxWidth: 1180 }}>
      <h1 style={{ fontFamily: fonts.heading, fontSize: isCompact ? 24 : 30, margin: 0, color: colors.text }}>
        New request
      </h1>
      <p style={{ margin: '4px 0 20px', color: colors.textLight, fontSize: 13 }}>
        Choose the models and how many of each. IGI see it as soon as you send.
      </p>

      <Pipeline active={0} />

      {error && (
        <div style={{ ...banner, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={dismiss} data-testid="dismiss-error">Dismiss</button>
        </div>
      )}

      {short.length > 0 && (
        <div
          style={{ ...banner, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', display: 'block' }}
          data-testid="shortage-warning"
        >
          <strong>
            IGI hold fewer than you are asking for on {short.length} model{short.length > 1 ? 's' : ''}.
          </strong>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            You can still send it — IGI will be told exactly what they are short by.
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }}>
            {short.map((m) => (
              <li key={m.id}>
                {m.name} — asking {formatQty(draft[m.id])}, they hold {formatQty(m.pool)},
                short by {formatQty(draft[m.id] - m.pool)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ ...card, padding: 14, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textMuted, fontWeight: 700 }}>
            Asking for
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: colors.inkPlum }} data-testid="request-total">
            {formatQty(total)} <span style={{ fontSize: 13, fontWeight: 500, color: colors.textLight }}>
              across {chosen.length} model{chosen.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <button
          onClick={send}
          disabled={sending || !chosen.length}
          data-testid="send-request"
          style={{
            ...btn.primary, marginLeft: 'auto',
            opacity: sending || !chosen.length ? 0.45 : 1,
            cursor: sending || !chosen.length ? 'not-allowed' : 'pointer',
          }}
        >
          {sending ? 'Sending…' : 'Send to IGI'}
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a name or serial"
        data-testid="search"
        style={{ ...inputSm, width: isCompact ? '100%' : 260, marginBottom: 10 }}
      />

      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
          <thead>
            <tr>
              <th style={th}>Model</th>
              <th style={th}>Serial · check</th>
              <th style={thNum}>IGI hold</th>
              <th style={thNum}>On our shelf</th>
              <th style={thNum}>Ask for</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => {
              const asked = draft[m.id] || 0
              const isShort = m.pool != null && asked > m.pool
              return (
                <tr key={m.id} data-testid="request-row" style={isShort ? { background: '#fffdf5' } : undefined}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                    {isShort && (
                      <div style={{ marginTop: 3 }}>
                        <Chip tone="watch">Short by {formatQty(asked - m.pool)}</Chip>
                      </div>
                    )}
                  </td>
                  <td style={td}><SerialSpec model={m} compact /></td>
                  <td style={tdNum}>{formatQty(m.pool)}</td>
                  <td style={tdNum}>
                    {m.shelf == null
                      ? <span style={{ color: colors.textMuted, fontSize: 12 }}>not mapped</span>
                      : formatQty(m.shelf)}
                  </td>
                  <td style={tdNum}>
                    <input
                      type="number"
                      min="0"
                      value={draft[m.id] ?? ''}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        setDraft((d) => ({
                          ...d,
                          [m.id]: Number.isInteger(n) && n >= 0 ? n : 0,
                        }))
                      }}
                      data-testid="ask-qty"
                      style={{ ...inputSm, width: 84, textAlign: 'right' }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {shown.length === 0 && (
          <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: 13 }}>
            No model matches that search.
          </p>
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
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10,
  fontSize: 13, marginBottom: 16,
}
const dismiss = {
  background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline',
  cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
}
