'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts, card, btn, inputSm } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, poolStatus, POOL_LABELS } from '@/lib/igi/derive'
import SerialSpec from './igi/SerialSpec'
import Chip, { POOL_TONE } from './igi/Chip'

/**
 * What IGI hold.
 *
 * "Asked right now" is what LoveLab are requesting in open movements — IGI's
 * order book. It is deliberately the only LoveLab figure on this page.
 */
export default function IgiStockClient() {
  const { isCompact } = useResponsive()
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [bulk, setBulk] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi-portal/stock')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not load your stock')
      setModels(body.models || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function setLevel(modelIds, poolMin) {
    setSaving(true)
    try {
      const res = await fetch('/api/igi-portal/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_ids: modelIds, pool_min: poolMin }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not save the level')
      setModels((prev) => prev.map((m) => (
        modelIds.includes(m.id) ? { ...m, pool_min: poolMin } : m
      )))
      setNotice(modelIds.length === 1
        ? 'Saved.'
        : `Set to ${poolMin} for ${modelIds.length} models.`)
      setTimeout(() => setNotice(null), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => `${m.name} ${m.serial} ${m.shape}`.toLowerCase().includes(q))
  }, [models, query])

  const low = models.filter((m) => poolStatus(m, m.pool) === 'reorder')

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ padding: isCompact ? 16 : 28, fontFamily: fonts.body, maxWidth: 1080 }}>
      <h1 style={{ fontFamily: fonts.heading, fontSize: isCompact ? 24 : 30, margin: 0, color: colors.text }}>
        My stock
      </h1>
      <p style={{ margin: '4px 0 20px', color: colors.textLight, fontSize: 13 }}>
        {models.length} models.
        {low.length > 0
          ? ` ${low.length} below the level you set — worth producing more.`
          : ' Nothing below the level you set.'}
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

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a name or serial"
          data-testid="search"
          style={{ ...inputSm, width: 240 }}
        />
        <span style={{ fontSize: 12, color: colors.textLight, marginLeft: 'auto' }}>
          Warn me below, for all {shown.length} shown:
        </span>
        <input
          type="number"
          min="0"
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          data-testid="bulk-value"
          style={{ ...inputSm, width: 90 }}
        />
        <button
          onClick={() => {
            const v = Number(bulk)
            if (Number.isInteger(v) && v >= 0 && shown.length) {
              setLevel(shown.map((m) => m.id), v)
              setBulk('')
            }
          }}
          disabled={saving || !bulk || !shown.length}
          data-testid="bulk-apply"
          style={{ ...btn.primary, padding: '6px 16px', fontSize: 12, opacity: saving || !bulk ? 0.5 : 1 }}
        >
          Apply
        </button>
      </div>

      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={th}>Model</th>
              <th style={th}>Serial · check</th>
              <th style={thNum}>You hold</th>
              <th style={thNum}>Warn me below</th>
              <th style={thNum}>Asked right now</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => {
              const status = poolStatus(m, m.pool)
              return (
                <tr key={m.id} data-testid="stock-row">
                  <td style={td}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                    {status === 'reorder' && (
                      <div style={{ marginTop: 3 }}>
                        <Chip tone={POOL_TONE[status]}>{POOL_LABELS[status]}</Chip>
                      </div>
                    )}
                  </td>
                  <td style={td}><SerialSpec model={m} compact /></td>
                  <td style={tdNum}>{formatQty(m.pool)}</td>
                  <td style={tdNum}>
                    <LevelInput
                      value={m.pool_min}
                      disabled={saving}
                      onCommit={(v) => v !== m.pool_min && setLevel([m.id], v)}
                    />
                  </td>
                  <td style={tdNum}>
                    {m.asked_now
                      ? <strong>{formatQty(m.asked_now)}</strong>
                      : <span style={{ color: colors.textMuted }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Saves when it loses focus. Empty means no warning for this model. */
function LevelInput({ value, disabled, onCommit }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => { setDraft(value == null ? '' : String(value)) }, [value])

  return (
    <input
      type="number"
      min="0"
      placeholder="—"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === '') return onCommit(null)
        const n = Number(draft)
        if (Number.isInteger(n) && n >= 0) onCommit(n)
        else setDraft(value == null ? '' : String(value))
      }}
      data-testid="pool-min"
      style={{ ...inputSm, width: 78, textAlign: 'right' }}
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
const banner = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10,
  fontSize: 13, marginBottom: 16,
}
const dismiss = {
  background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline',
  cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
}
