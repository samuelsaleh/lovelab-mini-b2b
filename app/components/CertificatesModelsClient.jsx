'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts, card, btn, inputSm } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, modelSpec } from '@/lib/igi/derive'
import SerialSpec from './igi/SerialSpec'
import Chip from './igi/Chip'

/**
 * The register of models and serials.
 *
 * Three states, and the difference matters:
 *   in use          — has a serial and a quantity, can be asked for
 *   reserved        — IGI numbered it, nothing was ever ordered. Kept so the
 *                     numbers are not lost, hidden from every other screen
 *   awaiting serial — asked for, IGI have not numbered it. Cannot be made
 *
 * Creating models and assigning serials happens with IGI directly, not here.
 */
export default function CertificatesModelsClient() {
  const { isCompact } = useResponsive()
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [showReserved, setShowReserved] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/overview')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the models')
      setModels(body.models || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function rename(modelId, name) {
    setSavingId(modelId)
    try {
      const res = await fetch('/api/igi/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId, name }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to save the name')
      setModels((prev) => prev.map((m) => (m.id === modelId ? { ...m, name: body.model.name } : m)))
      setNotice('Renamed. Nothing in the history moved — everything hangs on the serial.')
      setTimeout(() => setNotice(null), 5000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  const inUse = useMemo(() => models.filter((m) => m.state === 'in_use'), [models])
  const reserved = useMemo(() => models.filter((m) => m.state === 'reserved'), [models])
  const awaiting = useMemo(() => models.filter((m) => m.state === 'awaiting_serial'), [models])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return inUse
    return inUse.filter((m) => `${m.name} ${m.serial} ${m.shape}`.toLowerCase().includes(q))
  }, [inUse, query])

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
        Models &amp; serials
      </h1>
      <p style={{ margin: '4px 0 20px', color: colors.textLight, fontSize: 13 }}>
        {inUse.length} in use, {reserved.length} reserved serials, {awaiting.length} waiting for a
        serial. New models and serials are agreed with IGI directly, not created here.
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

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a name or serial"
        data-testid="search"
        style={{ ...inputSm, width: isCompact ? '100%' : 260, marginBottom: 10 }}
      />

      <div style={{ ...card, overflowX: 'auto', marginBottom: 18 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={th}>Serial · check</th>
              <th style={th}>Name — ours, and IGI follow it</th>
              <th style={thNum}>Ordered</th>
              <th style={thNum}>At IGI</th>
              <th style={thNum}>On our shelf</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id} data-testid="model-row">
                <td style={td}><SerialSpec model={m} /></td>
                <td style={td}>
                  <NameInput
                    value={m.name}
                    disabled={savingId === m.id}
                    onCommit={(v) => v !== m.name && rename(m.id, v)}
                  />
                  {m.igi_name && m.igi_name !== m.name && (
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 3 }}>
                      IGI&rsquo;s file called it {m.igi_name}
                    </div>
                  )}
                </td>
                <td style={tdNum}>{formatQty(m.qty_ordered)}</td>
                <td style={tdNum}>{formatQty(m.pool)}</td>
                <td style={tdNum}>
                  {m.shelf == null
                    ? <span style={{ color: colors.textMuted, fontSize: 12 }}>not mapped</span>
                    : formatQty(m.shelf)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {awaiting.length > 0 && (
        <div style={{ ...card, padding: 16, marginBottom: 18 }} data-testid="awaiting-serial">
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>
            Waiting for a serial ({awaiting.length})
          </h2>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.textLight }}>
            Asked for, but IGI have not numbered them yet. They cannot be requested until a serial
            and a first batch exist.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {awaiting.map((m) => (
              <div key={m.id} style={rowBox}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: colors.textLight }}>{modelSpec(m)}</div>
                </div>
                <Chip tone="watch">No serial yet</Chip>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 16 }}>
        <button
          onClick={() => setShowReserved((v) => !v)}
          data-testid="toggle-reserved"
          style={{ ...btn.secondary, padding: '6px 14px', fontSize: 12 }}
        >
          {showReserved ? 'Hide' : 'Show'} reserved serials ({reserved.length})
        </button>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: colors.textLight, maxWidth: 720, lineHeight: 1.6 }}>
          IGI assigned these numbers but nothing was ever ordered against them. They are kept on
          record so the numbers are not lost, and hidden from every operational screen so they
          cannot be requested by accident.
        </p>
        {showReserved && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reserved.map((m) => (
              <div key={m.id} style={rowBox} data-testid="reserved-row">
                <SerialSpec model={m} compact />
                <Chip tone="flat">Reserved</Chip>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Saves on blur rather than on every keystroke. */
function NameInput({ value, disabled, onCommit }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])

  return (
    <input
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim()
        if (next) onCommit(next)
        else setDraft(value)
      }}
      data-testid="model-name"
      style={{ ...inputSm, width: '100%', maxWidth: 380 }}
    />
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

const rowBox = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  gap: 12, padding: '8px 10px', borderRadius: 8, background: colors.bgOff,
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
