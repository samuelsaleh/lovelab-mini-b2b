'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatQty, SHELF_LABELS, POOL_LABELS } from '@/lib/igi/derive'
import SerialSpec from './igi/SerialSpec'
import Chip, { SHELF_TONE, POOL_TONE } from './igi/Chip'
import { PageHead, Card, Loading, Toast, Btn, TableWrap, Empty } from './certificates/ui'

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

  if (loading) return <Loading />

  return (
    <>
      <PageHead
        title="Stock & alerts"
        sub={`${models.length} models in use. We set the level on our shelf; IGI sets theirs.`}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a name or serial"
          data-testid="search"
          style={{ width: 200 }}
        />
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}
      {notice && <Toast testId="notice">{notice}</Toast>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <Btn
            key={f.id}
            kind={filter === f.id ? 'on' : undefined}
            onClick={() => setFilter(f.id)}
            testId={`filter-${f.id}`}
          >
            {f.label}
          </Btn>
        ))}
      </div>

      <div className="card">
        <div className="nextstep">
          <b>Set our alert level</b>
          <span>for all {shown.length} models shown</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              min="0"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              data-testid="bulk-value"
            />
            <Btn
              kind="primary"
              onClick={applyToAllShown}
              disabled={saving || !bulkValue || !shown.length}
              testId="bulk-apply"
            >
              Apply
            </Btn>
          </span>
        </div>
      </div>

      <Card flush>
        <TableWrap>
          <table style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>Model</th>
                <th>Serial · check</th>
                <th className="num">On our shelf</th>
                <th className="num">Our level</th>
                <th className="num">At IGI</th>
                <th className="num">IGI level</th>
                <th className="num">Asked now</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} data-testid="stock-row">
                  <td>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    <div style={{ marginTop: 3, display: 'flex', gap: 6 }}>
                      <Chip tone={SHELF_TONE[m.shelf_status]}>{SHELF_LABELS[m.shelf_status]}</Chip>
                      {m.pool_status === 'reorder' && (
                        <Chip tone={POOL_TONE[m.pool_status]}>{POOL_LABELS[m.pool_status]}</Chip>
                      )}
                    </div>
                  </td>
                  <td><SerialSpec model={m} compact /></td>
                  <td className="num">
                    {m.shelf == null ? <span className="spec">not mapped</span> : formatQty(m.shelf)}
                  </td>
                  <td className="num">
                    <AlertInput
                      value={m.shelf_min}
                      disabled={saving}
                      onCommit={(v) => v !== m.shelf_min && saveAlert([m.id], v)}
                    />
                  </td>
                  <td className="num">{formatQty(m.pool)}</td>
                  <td className="num">
                    {m.pool_min == null ? <span className="spec">not set</span> : formatQty(m.pool_min)}
                  </td>
                  <td className="num">
                    {m.asked_now ? formatQty(m.asked_now) : <span className="spec">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {shown.length === 0 && <Empty>No model matches this filter.</Empty>}
      </Card>
    </>
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
      style={{ width: 72 }}
    />
  )
}
