'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatQty, isUnnamed } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import Chip from './igi/Chip'
import { PageHead, Card, Loading, Toast, Btn, TableWrap, Empty, Switch } from './certificates/ui'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'collect', label: 'To collect' },
  { value: 'order', label: 'To order' },
]

/**
 * Stock — the front page of the certificate application, and for most days
 * the only one anybody opens.
 *
 * One line per model, five columns: the model, what is on our shelf, what IGI
 * hold, what to do about it, and how many to ask for. The whole logic is two
 * levels per model, set on Models:
 *
 *   shelf below its level  →  Collect — walk across the road, IGI already
 *                             hold them
 *   IGI pool below its level  →  Order at IGI — production, about a month
 *
 * The chips say that in words. The person packing orders and the person
 * managing stock read the same line.
 *
 * Sam, 16 Sept 2026: "too much information". This screen used to carry ten
 * columns and sat behind a dashboard that repeated it. The dashboard is gone;
 * the one line under the title says what it used to say. The alert levels
 * moved to Models, where a model's settings belong — here you only read them.
 */
export default function CertificatesStockClient() {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState({})
  const [shelfHistory, setShelfHistory] = useState(null)
  const [shelfLoading, setShelfLoading] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/overview')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the certificate stock')
      setData(body)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function openShelfHistory(model) {
    setShelfLoading(true)
    setShelfHistory({ model, loading: true })
    try {
      const res = await fetch(`/api/igi/models/${model.id}/shelf-history`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load shelf history')
      setShelfHistory(body)
      setError(null)
    } catch (err) {
      setError(err.message)
      setShelfHistory(null)
    } finally {
      setShelfLoading(false)
    }
  }

  // Reserved serials and models still waiting for one are kept off this
  // screen; neither can be asked for.
  const models = useMemo(
    () => (data?.models || []).filter((m) => m.state === 'in_use'),
    [data],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return models.filter((m) => {
      if (filter === 'collect' && !needsCollect(m)) return false
      if (filter === 'order' && !needsOrder(m)) return false
      if (!q) return true
      return `${m.name} ${m.serial} ${m.shape}`.toLowerCase().includes(q)
    })
  }, [models, filter, query])

  const toCollect = models.filter(needsCollect).length
  const toOrder = models.filter(needsOrder).length
  const unmapped = models.filter((m) => m.shelf == null).length

  // ── The request ─────────────────────────────────────────────────────────
  const chosen = useMemo(() => models.filter((m) => draft[m.id] > 0), [models, draft])
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

  if (loading) return <Loading />

  const lastRead = data?.shelf?.last_read

  return (
    <>
      <PageHead
        title="Stock"
        sub="One line per model: what is on our shelf, what IGI hold, what to do."
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a model"
          data-testid="search"
          style={{ width: 230 }}
        />
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}

      {/* ── What a dashboard used to take a screen to say ─────────────────── */}
      <p className="facts" data-testid="facts">
        <span data-testid="fact-collect"><b>{toCollect}</b> to collect</span>
        <span className="dot">·</span>
        <span data-testid="fact-order"><b>{toOrder}</b> to order</span>
        <span className="dot">·</span>
        <span data-testid="fact-shelf">
          {lastRead ? `shelf read on ${formatDate(lastRead)}` : 'shelf not read yet'}
        </span>
        {unmapped > 0 && (
          <>
            <span className="dot">·</span>
            <span data-testid="fact-unmapped">
              <b>{unmapped}</b> without a shelf figure — <Link href="/certificates/matching">match them</Link>
            </span>
          </>
        )}
      </p>

      <Card
        title="Models"
        sub={`${models.length} in use`}
        head={
          <>
            <Switch options={FILTERS} value={filter} onChange={setFilter} testId="filter" />
            <Btn kind="primary" onClick={send} disabled={sending || !chosen.length} testId="send-request">
              {sending
                ? 'Sending…'
                : chosen.length
                  ? `Send to IGI · ${formatQty(total)} on ${chosen.length} line${chosen.length === 1 ? '' : 's'}`
                  : 'Send to IGI'}
            </Btn>
          </>
        }
        flush
      >
        <TableWrap>
          <table style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ width: '44%' }}>Model</th>
                <th className="num">On our shelf</th>
                <th className="num">At IGI</th>
                <th>What to do</th>
                <th className="num">Ask for</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => {
                const asked = draft[m.id] || 0
                const short = m.pool != null && asked > m.pool ? asked - m.pool : 0
                return (
                  <tr key={m.id} data-testid="stock-row">
                    <td><ModelCell model={m} /></td>
                    <td className="num" data-testid="shelf-cell">
                      {m.shelf == null ? (
                        <>
                          <span className="n zero">—</span>
                          <span className="lvl">no shelf figure</span>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="shelf-link"
                          data-testid="shelf-open"
                          title="See how this shelf figure was built"
                          onClick={() => openShelfHistory(m)}
                          disabled={shelfLoading}
                        >
                          <span className={needsCollect(m) ? 'n low' : 'n'}>{formatQty(m.shelf)}</span>
                          <span className="lvl">level {formatQty(shelfLevel(m))} · history</span>
                        </button>
                      )}
                    </td>
                    <td className="num" data-testid="igi-cell">
                      <span className={needsOrder(m) ? 'n low' : 'n'}>{formatQty(m.pool)}</span>
                      <span className="lvl">
                        {igiLevel(m) == null ? 'no level yet' : `level ${formatQty(igiLevel(m))}`}
                      </span>
                    </td>
                    <td data-testid="todo-cell">
                      <ToDo model={m} short={short} />
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
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
        {shown.length === 0 && <Empty>No model matches.</Empty>}
        <div className="card-foot">
          <span>
            Shelf below its level: <b>Collect</b> from IGI. IGI pool below its level: <b>Order at IGI</b>.
            Levels are set on <Link href="/certificates/models">Models</Link>.
            Click a shelf number for In / Out history.
          </span>
          <Link href="/certificates/visits" className="right">Movements →</Link>
        </div>
      </Card>

      {shelfHistory && (
        <ShelfHistoryModal
          data={shelfHistory}
          loading={shelfLoading || shelfHistory.loading}
          onClose={() => setShelfHistory(null)}
        />
      )}
    </>
  )
}

// ── The two rules, read off what the server derived ────────────────────────

/** Below our own level on our shelf. */
function needsCollect(m) {
  return m.shelf_status === 'collect'
}

/** Below the level we want IGI to hold. IGI see the same line on their To do. */
function needsOrder(m) {
  return m.order_status === 'order'
}

function shelfLevel(m) {
  return m.shelf_min ?? 25
}

/** The one level on IGI's stock: ours, and IGI see it too. */
function igiLevel(m) {
  return m.order_min ?? null
}

function ModelCell({ model: m }) {
  const spec = [m.serial, [m.stones ? `${m.stones} ×` : null, m.carat != null ? String(m.carat).replace('.', ',') : null, m.shape].filter(Boolean).join(' '), m.spec]
    .filter(Boolean).join(' · ')
  return (
    <>
      {isUnnamed(m) ? (
        <div className="mname unnamed" data-testid="model-name">Unnamed model</div>
      ) : (
        <div className="mname" data-testid="model-name">{m.name}</div>
      )}
      <span className="spec">
        {spec}
        {isUnnamed(m) && <> &nbsp;<Link href="/certificates/models" data-testid="name-it">Name it →</Link></>}
      </span>
    </>
  )
}

function ToDo({ model: m, short }) {
  const chips = []
  if (needsCollect(m)) chips.push(<Chip key="c" tone="now">Collect</Chip>)
  if (needsOrder(m)) chips.push(<Chip key="o" tone="watch">Order at IGI</Chip>)
  if (m.asked_now > 0) chips.push(<Chip key="a" tone="a">Asked · {formatQty(m.asked_now)}</Chip>)
  if (short > 0) chips.push(<Chip key="s" tone="watch">Short by {formatQty(short)}</Chip>)
  if (!chips.length) return <span className="quiet">—</span>
  return <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>{chips}</span>
}

function ShelfHistoryModal({ data, loading, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const model = data.model || {}
  const shelf = data.shelf || {}
  const ledger = data.certificate_ledger || {}
  const title = model.name && model.name !== '—' ? model.name : (model.serial || 'Model')

  return (
    <div
      className="shelf-overlay"
      data-testid="shelf-history"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="shelf-panel" role="dialog" aria-modal="true" aria-labelledby="shelf-history-title">
        <div className="ph">
          <div>
            <h2 id="shelf-history-title">{title}</h2>
            <span className="sub">
              {[model.serial, model.shape].filter(Boolean).join(' · ')}
              {shelf.as_of ? ` · shelf as of ${formatDate(shelf.as_of)}` : ''}
            </span>
          </div>
          <span className="close">
            <Btn onClick={onClose} testId="shelf-history-close">Close</Btn>
          </span>
        </div>

        <div className="body">
          {loading ? (
            <Loading />
          ) : (
            <>
              <div className="sum" data-testid="shelf-summary">
                <div className="pill">
                  <b>{shelf.current == null ? '—' : formatQty(shelf.current)}</b>
                  <span>On our shelf</span>
                </div>
                <div className="pill in">
                  <b>{formatQty(ledger.total_in || 0)}</b>
                  <span>Certificate In</span>
                </div>
                <div className="pill out">
                  <b>{formatQty(ledger.total_out || 0)}</b>
                  <span>Certificate Out</span>
                </div>
                <div className="pill">
                  <b>{formatQty(ledger.net || 0)}</b>
                  <span>In − Out</span>
                </div>
              </div>

              <p style={{ fontSize: '.83rem', color: 'var(--ink-faint)', lineHeight: 1.55, margin: '0 0 18px' }}>
                <b>On our shelf</b> comes from the nightly packing-stock read
                {shelf.descriptions?.length ? (
                  <> (mapped description{shelf.descriptions.length === 1 ? '' : 's'}:{' '}
                    {shelf.descriptions.map((d, i) => (
                      <span key={d}><code>{d}</code>{i < shelf.descriptions.length - 1 ? ', ' : ''}</span>
                    ))})
                  </>
                ) : null}
                . <b>In − Out</b> is the Certificate ledger from the stock software. If the two
                numbers differ, Matching or packing vs certificate stock is out of step.
              </p>

              <Card title="Certificate In / Out" sub={ledger.source || ''} flush>
                <TableWrap>
                  <table data-testid="shelf-ledger-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Invoice</th>
                        <th>Party</th>
                        <th className="num">Pcs</th>
                        <th className="num">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ledger.entries || []).map((e) => (
                        <tr key={e.id} data-testid="shelf-ledger-row">
                          <td>{e.date ? formatDate(e.date) : '—'}</td>
                          <td>
                            {e.kind === 'in'
                              ? <Chip tone="fine">In</Chip>
                              : <Chip tone="now">Out</Chip>}
                            {e.external_ref && /^visit:/i.test(String(e.external_ref)) && (
                              <span className="spec" style={{ marginLeft: 6 }}>IGI receive</span>
                            )}
                          </td>
                          <td className="mono">{e.invoice_no ?? '—'}</td>
                          <td>{e.party || '—'}</td>
                          <td className={`num ${e.kind === 'in' ? 'delta-pos' : 'delta-neg'}`}>
                            {e.kind === 'in' ? '+' : '−'}{formatQty(e.pcs)}
                          </td>
                          <td className="num">{formatQty(e.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
                {!(ledger.entries || []).length && (
                  <Empty>No Certificate In/Out lines synced for this model yet.</Empty>
                )}
              </Card>

              <div style={{ height: 16 }} />

              <Card title="Nightly shelf snapshots" sub={shelf.source || ''} flush>
                <TableWrap>
                  <table data-testid="shelf-snapshot-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="num">On shelf</th>
                        <th className="num">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(shelf.history || []).map((h) => (
                        <tr key={h.date} data-testid="shelf-snapshot-row">
                          <td>{formatDate(h.date)}</td>
                          <td className="num">{formatQty(h.pcs)}</td>
                          <td className={`num ${h.change == null ? '' : h.change >= 0 ? 'delta-pos' : 'delta-neg'}`}>
                            {h.change == null
                              ? '—'
                              : `${h.change >= 0 ? '+' : '−'}${formatQty(Math.abs(h.change))}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
                {!(shelf.history || []).length && (
                  <Empty>No shelf snapshots for this model yet. Matching must link a packing description first.</Empty>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
