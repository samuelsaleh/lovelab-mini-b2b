'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatQty, poolStatus, POOL_LABELS } from '@/lib/igi/derive'
import { Serial, Spec } from './igi/SerialSpec'
import Chip, { POOL_TONE } from './igi/Chip'
import { useIgiPortal } from './certificates/IgiPortalContext'
import { PageHead, Card, Loading, Toast, Btn, TableWrap, Empty } from './certificates/ui'

/**
 * What IGI hold.
 *
 * "Asked right now" is what LoveLab are requesting in open movements — IGI's
 * order book. It is deliberately the only LoveLab figure on this page.
 */
export default function IgiStockClient() {
  const { base, readOnly } = useIgiPortal()
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
      const res = await fetch(`${base}/stock`)
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

  if (loading) return <Loading />

  return (
    <>
      <PageHead
        title="My stock"
        sub={`${models.length} models. ${low.length > 0
          ? `${low.length} below the level you set — worth producing more.`
          : 'Nothing below the level you set.'}`}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a name or serial"
          data-testid="search"
          style={{ width: 220 }}
        />
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}
      {notice && <Toast testId="notice">{notice}</Toast>}

      <div className="card">
        <div className="nextstep">
          <b>Warn me below</b>
          <span>for all {shown.length} models shown</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              min="0"
              value={bulk}
              disabled={readOnly}
              onChange={(e) => setBulk(e.target.value)}
              data-testid="bulk-value"
            />
            <Btn
              kind="primary"
              onClick={() => {
                const v = Number(bulk)
                if (Number.isInteger(v) && v >= 0 && shown.length) {
                  setLevel(shown.map((m) => m.id), v)
                  setBulk('')
                }
              }}
              disabled={readOnly || saving || !bulk || !shown.length}
              testId="bulk-apply"
            >
              Apply
            </Btn>
          </span>
        </div>
      </div>

      <Card flush>
        <TableWrap>
          <table style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Model</th>
                <th>Check</th>
                <th>Serial</th>
                <th className="num">You hold</th>
                <th className="num">Warn me below</th>
                <th className="num">Asked right now</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => {
                const status = poolStatus(m, m.pool)
                return (
                  <tr key={m.id} data-testid="stock-row">
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      {status === 'reorder' && (
                        <div style={{ marginTop: 3 }}>
                          <Chip tone={POOL_TONE[status]}>{POOL_LABELS[status]}</Chip>
                        </div>
                      )}
                    </td>
                    <td><Spec model={m} compact /></td>
                    <td><Serial model={m} compact /></td>
                    <td className="num">{formatQty(m.pool)}</td>
                    <td className="num">
                      <LevelInput
                        value={m.pool_min}
                        disabled={readOnly || saving}
                        onCommit={(v) => v !== m.pool_min && setLevel([m.id], v)}
                      />
                    </td>
                    <td className="num">
                      {m.asked_now
                        ? <strong>{formatQty(m.asked_now)}</strong>
                        : <span className="spec">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
        {shown.length === 0 && <Empty>No model matches that search.</Empty>}
      </Card>
    </>
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
      style={{ width: 78 }}
    />
  )
}
