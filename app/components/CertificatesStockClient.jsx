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
                        <>
                          <span className={needsCollect(m) ? 'n low' : 'n'}>{formatQty(m.shelf)}</span>
                          <span className="lvl">level {formatQty(shelfLevel(m))}</span>
                        </>
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
          </span>
          <Link href="/certificates/visits" className="right">Movements →</Link>
        </div>
      </Card>
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
