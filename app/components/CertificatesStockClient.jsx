'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatQty, SHELF_LABELS, POOL_LABELS, ORDER_LABELS } from '@/lib/igi/derive'
import { Serial, Spec } from './igi/SerialSpec'
import Chip, { SHELF_TONE, POOL_TONE, ORDER_TONE } from './igi/Chip'
import { PageHead, Card, Loading, Note, Toast, Btn, TableWrap, Empty } from './certificates/ui'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'collect', label: 'Go collect' },
  { id: 'produce', label: 'Produce more' },
  { id: 'unmapped', label: 'No shelf figure' },
]

/**
 * Stock — one row per model, and the request written on the same row.
 *
 * Sam, 10 Sept 2026: "why is it so complex?" The old New request screen was
 * this same table with an extra column, so the column moved here. You see
 * what is on the shelf and what IGI hold, you type how many you want in the
 * last column, and one button at the top sends it. Asking for more than IGI
 * hold is allowed — the warning is there so nobody walks across the road
 * expecting 500 and comes back with 41.
 *
 * LoveLab set the alert level on their own shelf; IGI's level is shown but
 * not editable here, because each rule has exactly one owner.
 */
export default function CertificatesStockClient() {
  const router = useRouter()
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [bulkValue, setBulkValue] = useState('')
  const [draft, setDraft] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/overview')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the certificate stock')
      // Reserved serials and models still waiting for one are kept off every
      // operational screen; neither can be asked for.
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
      if (filter === 'produce' && m.pool_status !== 'reorder' && m.order_status !== 'order') return false
      if (filter === 'unmapped' && m.shelf != null) return false
      if (!q) return true
      return `${m.name} ${m.serial} ${m.shape}`.toLowerCase().includes(q)
    })
  }, [models, filter, query])

  // ── The request ─────────────────────────────────────────────────────────
  const chosen = useMemo(() => models.filter((m) => draft[m.id] > 0), [models, draft])
  const short = useMemo(
    () => chosen.filter((m) => m.pool != null && draft[m.id] > m.pool),
    [chosen, draft],
  )
  const total = chosen.reduce((t, m) => t + draft[m.id], 0)

  async function send() {
    setSending(true)
    try {
      const res = await fetch('/api/igi/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: chosen.map((m) => ({ model_id: m.id, qty: draft[m.id] })) }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to send the request')
      router.push(`/certificates/visits/${body.visit.id}`)
    } catch (err) {
      setError(err.message)
      setSending(false)
    }
  }

  // ── The alert levels: ours on the shelf, ours on IGI's stock ───────────
  async function saveAlert(modelIds, shelfMin, orderMin) {
    setSaving(true)
    try {
      const payload = { model_ids: modelIds }
      if (shelfMin !== undefined) payload.shelf_min = shelfMin
      if (orderMin !== undefined) payload.order_min = orderMin
      const res = await fetch('/api/igi/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to save the alert level')
      setModels((prev) => prev.map((m) => (
        modelIds.includes(m.id)
          ? { ...m, ...(shelfMin !== undefined ? { shelf_min: shelfMin } : {}), ...(orderMin !== undefined ? { order_min: orderMin } : {}) }
          : m
      )))
      setNotice(
        modelIds.length === 1
          ? (orderMin !== undefined ? 'Level at IGI saved. You will be emailed when they fall below it.' : 'Alert level saved.')
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
        title="Stock"
        sub={`${models.length} models. What is on our shelf, what IGI hold, and what to ask them for.`}
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

      {/* ── What is about to be sent, and the one button that sends it ────── */}
      <div className="card">
        <div className="crow" data-testid="request-total">
          <div className="k">
            Asking IGI for
            <small>
              {chosen.length === 0
                ? 'type a quantity in the last column of any model'
                : `across ${chosen.length} model${chosen.length === 1 ? '' : 's'}`}
            </small>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span className="v">{formatQty(total)}</span>
            <Btn kind="primary" onClick={send} disabled={sending || !chosen.length} testId="send-request">
              {sending ? 'Sending…' : 'Send to IGI'}
            </Btn>
          </div>
        </div>
      </div>

      {short.length > 0 && (
        <Note warn testId="shortage-warning">
          <strong>
            IGI hold fewer than you are asking for on {short.length} model{short.length > 1 ? 's' : ''}.
          </strong>
          <div style={{ marginTop: 6 }}>
            You can still send it — IGI will be told exactly what they are short by.
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {short.map((m) => (
              <li key={m.id}>
                {m.name} — asking {formatQty(draft[m.id])}, they hold {formatQty(m.pool)},
                short by {formatQty(draft[m.id] - m.pool)}
              </li>
            ))}
          </ul>
        </Note>
      )}

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
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem', color: 'var(--ink-soft)' }}>
          Our alert level for the {shown.length} shown
          <input
            type="number"
            min="0"
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            data-testid="bulk-value"
            style={{ width: 72 }}
          />
          <Btn onClick={applyToAllShown} disabled={saving || !bulkValue || !shown.length} testId="bulk-apply">
            Apply
          </Btn>
        </span>
      </div>

      <Card flush>
        <TableWrap>
          <table style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Model</th>
                <th>Check</th>
                <th>Serial</th>
                <th className="num">On our shelf</th>
                <th className="num">Our level</th>
                <th className="num">At IGI</th>
                <th className="num" title="When IGI hold fewer than this, you are emailed and it shows under Produce more">Our level at IGI</th>
                <th className="num">IGI level</th>
                <th className="num">Asked now</th>
                <th className="num">Ask for</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => {
                const asked = draft[m.id] || 0
                const isShort = m.pool != null && asked > m.pool
                return (
                  <tr key={m.id} data-testid="stock-row">
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      <div style={{ marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Chip tone={SHELF_TONE[m.shelf_status]}>{SHELF_LABELS[m.shelf_status]}</Chip>
                        {m.pool_status === 'reorder' && (
                          <Chip tone={POOL_TONE[m.pool_status]}>{POOL_LABELS[m.pool_status]}</Chip>
                        )}
                        {(m.order_status === 'order' || m.order_status === 'watch') && (
                          <Chip tone={ORDER_TONE[m.order_status]}>{ORDER_LABELS[m.order_status]}{m.order_status === 'watch' ? ' at IGI' : ''}</Chip>
                        )}
                        {isShort && <Chip tone="watch">Short by {formatQty(asked - m.pool)}</Chip>}
                      </div>
                    </td>
                    <td><Spec model={m} compact /></td>
                    <td><Serial model={m} compact /></td>
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
                      <LevelInput
                        value={m.order_min}
                        allowEmpty
                        disabled={saving}
                        testId="order-min"
                        onCommit={(v) => v !== (m.order_min ?? null) && saveAlert([m.id], undefined, v)}
                      />
                    </td>
                    <td className="num">
                      {m.pool_min == null ? <span className="spec">not set</span> : formatQty(m.pool_min)}
                    </td>
                    <td className="num">
                      {m.asked_now ? formatQty(m.asked_now) : <span className="spec">—</span>}
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min="0"
                        value={draft[m.id] ?? ''}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setDraft((d) => ({ ...d, [m.id]: Number.isInteger(n) && n >= 0 ? n : 0 }))
                        }}
                        data-testid="ask-qty"
                        style={{ width: 72 }}
                      />
                    </td>
                  </tr>
                )
              })}
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
  return <LevelInput value={value} disabled={disabled} onCommit={onCommit} testId="shelf-min" />
}

/**
 * The same, with `allowEmpty` meaning "no level" is a valid answer — used for
 * our level on IGI's stock, which is an opinion LoveLab may choose not to hold.
 */
function LevelInput({ value, disabled, onCommit, testId, allowEmpty = false }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))

  useEffect(() => { setDraft(value == null ? '' : String(value)) }, [value])

  return (
    <input
      type="number"
      min="0"
      value={draft}
      placeholder={allowEmpty ? 'none' : undefined}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() === '') {
          if (allowEmpty) onCommit(null)
          else setDraft(value == null ? '' : String(value))
          return
        }
        const n = Number(draft)
        if (Number.isInteger(n) && n >= 0) onCommit(n)
        else setDraft(value == null ? '' : String(value))
      }}
      data-testid={testId}
      style={{ width: 72 }}
    />
  )
}
