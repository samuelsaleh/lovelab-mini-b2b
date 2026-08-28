'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts, card, btn, inputSm } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, SHELF_LABELS, POOL_LABELS } from '@/lib/igi/derive'
import SerialSpec from './igi/SerialSpec'
import Chip, { SHELF_TONE, POOL_TONE } from './igi/Chip'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'collect', label: 'Go collect' },
  { id: 'produce', label: 'Produce more' },
  { id: 'unmapped', label: 'No shelf figure' },
]

/**
 * Every model, both sides, with both alert levels.
 *
 * LoveLab sets the level on their own shelf; IGI's level is shown but not
 * editable here, because each rule has exactly one owner.
 */
export default function CertificatesStockClient() {
  const { isCompact } = useResponsive()
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [bulkValue, setBulkValue] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/overview')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the certificate stock')
      // Reserved serials and models still waiting for one are kept off every
      // operational screen.
      setModels((body.models || []).filter((m) => m.state === 'in_use'))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return models.filter((m) => {
      if (filter === 'collect' && m.shelf_status !== 'collect') return false
      if (filter === 'produce' && m.pool_status !== 'reorder') return false
      if (filter === 'unmapped' && m.shelf != null) return false
      if (!q) return true
      return `${m.name} ${m.serial} ${m.shape}`.toLowerCase().includes(q)
    })
  }, [models, filter, query])

  async function saveAlert(modelIds, shelfMin) {
    setSaving(true)
    try {
      const res = await fetch('/api/igi/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_ids: modelIds, shelf_min: shelfMin }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to save the alert level')
      setModels((prev) => prev.map((m) => (
        modelIds.includes(m.id) ? { ...m, shelf_min: shelfMin } : m
      )))
      setNotice(
        modelIds.length === 1
          ? 'Alert level saved.'
          : `Alert level set to ${shelfMin} for ${modelIds.length} models.`,
      )
      setTimeout(() => setNotice(null), 4000)
      // The status chips are derived server-side, so refresh to pick them up.
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function applyToAllShown() {
    const value = Number(bulkValue)
    if (!Number.isInteger(value) || value < 0 || !shown.length) return
    saveAlert(shown.map((m) => m.id), value)
    setBulkValue('')
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
        Stock &amp; alerts
      </h1>
      <p style={{ margin: '4px 0 20px', color: colors.textLight, fontSize: 13 }}>
        {models.length} models in use. We set the level on our shelf; IGI sets theirs.
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

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            data-testid={`filter-${f.id}`}
            style={{
              ...btn.secondary,
              padding: '6px 14px',
              fontSize: 12,
              background: filter === f.id ? colors.inkPlum : '#fff',
              color: filter === f.id ? '#fff' : colors.inkPlum,
            }}
          >
            {f.label}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a name or serial"
          data-testid="search"
          style={{ ...inputSm, width: 200, marginLeft: 'auto' }}
        />
      </div>

      <div style={{ ...card, padding: 12, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: colors.textLight }}>
          Set our alert level for all {shown.length} shown:
        </span>
        <input
          type="number"
          min="0"
          value={bulkValue}
          onChange={(e) => setBulkValue(e.target.value)}
          data-testid="bulk-value"
          style={{ ...inputSm, width: 90 }}
        />
        <button
          onClick={applyToAllShown}
          disabled={saving || !bulkValue || !shown.length}
          data-testid="bulk-apply"
          style={{ ...btn.primary, padding: '6px 16px', fontSize: 12, opacity: saving || !bulkValue ? 0.5 : 1 }}
        >
          Apply
        </button>
      </div>

      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>Model</th>
              <th style={th}>Serial · check</th>
              <th style={thNum}>On our shelf</th>
              <th style={thNum}>Our level</th>
              <th style={thNum}>At IGI</th>
              <th style={thNum}>IGI level</th>
              <th style={thNum}>Asked now</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id} data-testid="stock-row">
                <td style={td}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                  <div style={{ marginTop: 3, display: 'flex', gap: 6 }}>
                    <Chip tone={SHELF_TONE[m.shelf_status]}>{SHELF_LABELS[m.shelf_status]}</Chip>
                    {m.pool_status === 'reorder' && (
                      <Chip tone={POOL_TONE[m.pool_status]}>{POOL_LABELS[m.pool_status]}</Chip>
                    )}
                  </div>
                </td>
                <td style={td}><SerialSpec model={m} compact /></td>
                <td style={tdNum}>
                  {m.shelf == null
                    ? <span style={{ color: colors.textMuted, fontSize: 12 }}>not mapped</span>
                    : formatQty(m.shelf)}
                </td>
                <td style={tdNum}>
                  <AlertInput
                    value={m.shelf_min}
                    disabled={saving}
                    onCommit={(v) => v !== m.shelf_min && saveAlert([m.id], v)}
                  />
                </td>
                <td style={tdNum}>{formatQty(m.pool)}</td>
                <td style={tdNum}>
                  {m.pool_min == null
                    ? <span style={{ color: colors.textMuted, fontSize: 12 }}>not set</span>
                    : formatQty(m.pool_min)}
                </td>
                <td style={tdNum}>
                  {m.asked_now ? formatQty(m.asked_now) : <span style={{ color: colors.textMuted }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {shown.length === 0 && (
          <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: 13 }}>
            No model matches this filter.
          </p>
        )}
      </div>
    </div>
  )
}

/** A number field that saves when it loses focus, not on every keystroke. */
function AlertInput({ value, disabled, onCommit }) {
  const [draft, setDraft] = useState(String(value ?? ''))

  useEffect(() => { setDraft(String(value ?? '')) }, [value])

  return (
    <input
      type="number"
      min="0"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft)
        if (Number.isInteger(n) && n >= 0) onCommit(n)
        else setDraft(String(value ?? ''))
      }}
      data-testid="shelf-min"
      style={{ ...inputSm, width: 72, textAlign: 'right' }}
    />
  )
}

const th = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 700,
  color: colors.textMuted,
  borderBottom: `1px solid ${colors.border}`,
  whiteSpace: 'nowrap',
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
