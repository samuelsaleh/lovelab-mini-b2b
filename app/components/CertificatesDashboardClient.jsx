'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatQty, suggestedAsk, POOL_LABELS } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import SerialSpec from './igi/SerialSpec'
import Chip, { POOL_TONE } from './igi/Chip'
import { PageHead, Loading, Note, Toast, Btn } from './certificates/ui'

/**
 * Where the certificates stand, both sides at once — and the one thing to do
 * about it, ready to send.
 *
 * LoveLab need their own shelf and IGI's stock together, because the decision
 * is between walking across the road and ordering a month of production.
 *
 * Sam, 10 Sept 2026: the dashboard already says what to collect; now it also
 * proposes how many, and sends the request from here. The suggestion tops each
 * low model back up to twice its alert level, never beyond what IGI hold. Every
 * number can be changed before sending.
 */
export default function CertificatesDashboardClient() {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [ask, setAsk] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/overview')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the certificate stock')
      setData(body)
      // Prefill the request with the suggestion for every model to collect.
      const prefill = {}
      for (const m of body.models || []) {
        if (m.shelf_status === 'collect') prefill[m.id] = suggestedAsk(m).qty
      }
      setAsk(prefill)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toCollect = useMemo(
    () => (data?.models || []).filter((m) => m.shelf_status === 'collect'),
    [data],
  )
  // Below IGI's own level, or below ours on IGI's stock (Sam, 10 Sept 2026):
  // either way, production is the answer.
  const toProduce = useMemo(
    () => (data?.models || []).filter((m) => m.pool_status === 'reorder' || m.order_status === 'order'),
    [data],
  )
  const lines = toCollect
    .map((m) => ({ model_id: m.id, qty: Number(ask[m.id]) || 0 }))
    .filter((l) => l.qty > 0)
  const askTotal = lines.reduce((t, l) => t + l.qty, 0)

  async function sendRequest() {
    setSending(true)
    try {
      const res = await fetch('/api/igi/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
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

  const t = data?.totals || {}

  return (
    <>
      <PageHead
        title="Dashboard"
        sub={data?.shelf?.last_read
          ? `Our shelf was last read on ${formatDate(data.shelf.last_read)}`
          : 'Our shelf has not been read yet'}
      >
        <Btn onClick={() => router.push('/certificates/stock')} testId="go-stock">Ask IGI for anything else</Btn>
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}

      {/* ── The two numbers the whole thing exists to answer ─────────────── */}
      <div className="split" style={{ marginBottom: 14 }}>
        <BigStat
          label="On our shelf"
          value={formatQty(t.on_shelf)}
          note="Received, waiting to be packed with an order."
          tone={t.to_collect ? 'now' : 'fine'}
          chip={t.to_collect ? `${t.to_collect} to collect` : 'Nothing to collect'}
          testId="stat-shelf"
        />
        <BigStat
          label="Still unissued at IGI"
          value={formatQty(t.at_igi)}
          note="Pre-printed or not yet produced. Emptying this is about a month of production."
          tone={t.to_produce ? 'now' : 'fine'}
          chip={t.to_produce ? `${t.to_produce} to produce` : 'Nothing to produce'}
          testId="stat-igi"
        />
      </div>

      {/* ── The rest of the figures, in one line rather than four boxes ──── */}
      <p className="facts" data-testid="facts" style={{ display: 'flex', gap: '6px 22px', flexWrap: 'wrap', margin: '0 0 18px', fontSize: '.86rem', color: 'var(--ink-soft)' }}>
        <span data-testid="stat-models"><b>{formatQty(t.models_in_use)}</b> models in use</span>
        <span data-testid="stat-ordered"><b>{formatQty(t.ordered)}</b> ordered in total</span>
        <span data-testid="stat-open" style={t.open_visits ? { color: 'var(--accent)' } : undefined}><b>{formatQty(t.open_visits)}</b> open movement{t.open_visits === 1 ? '' : 's'}</span>
        <span data-testid="stat-reserved"><b>{formatQty(t.reserved)}</b> reserved serials, never ordered</span>
      </p>

      {/* ── The gap. Visible, never absorbed — but one line, not a paragraph. */}
      {t.unattributed > 0 && (
        <Note warn testId="gap-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="bignum" style={{ color: 'var(--signal)' }}>{formatQty(t.unattributed)}</span>
            <strong>certificates issued with no model attached</strong>
            <Chip tone="a">Unresolved</Chip>
            <span style={{ color: 'var(--ink-soft)' }}>
              Recorded as daily totals between 16 June and 28 July 2026, so every per-model figure here is short by some part of this.
            </span>
            <Btn onClick={() => router.push('/certificates/daily')} testId="go-gap">See those days</Btn>
          </div>
        </Note>
      )}

      {data?.shelf?.unlinked > 0 && (
        <Note>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 260 }}>
              {data.shelf.unlinked} stock description{data.shelf.unlinked > 1 ? 's are' : ' is'} not
              linked to a model yet, so {data.shelf.unlinked > 1 ? 'those models have' : 'that model has'} no
              shelf figure.
            </span>
            <Btn onClick={() => router.push('/certificates/models#matching')} testId="go-matching">
              Open matching
            </Btn>
          </div>
        </Note>
      )}

      <div className="split">
        {/* ── Go collect: the recommendation, and the request ready to send ── */}
        <div className="card" data-testid="list-collect">
          <div className="card-head">
            <h3>Go collect</h3>
            <span className="sub">{toCollect.length}</span>
            <span className="right" style={{ fontSize: '.8rem', color: 'var(--ink-faint)' }}>
              Below our alert level. IGI already hold them — it is a walk across the road.
            </span>
          </div>
          {toCollect.length === 0 ? (
            <div className="empty">Every model is above its alert level.</div>
          ) : (
            <>
              <div className="tblwrap">
                <table style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="num">On shelf</th>
                      <th className="num">IGI hold</th>
                      <th className="num">Ask for</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toCollect.map((m) => {
                      const s = suggestedAsk(m)
                      return (
                        <tr key={m.id} data-testid="collect-row">
                          <td>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>{m.name}</div>
                            <SerialSpec model={m} compact />
                          </td>
                          <td className="num">
                            <b style={{ color: 'var(--signal)' }}>{formatQty(m.shelf)}</b>
                            <div className="spec">level {formatQty(m.shelf_min ?? 25)}</div>
                          </td>
                          <td className="num">
                            {formatQty(m.pool)}
                            {s.capped && <div className="spec">all they have</div>}
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              min="0"
                              value={ask[m.id] ?? ''}
                              onChange={(e) => {
                                const n = Number(e.target.value)
                                setAsk((a) => ({ ...a, [m.id]: Number.isInteger(n) && n >= 0 ? n : 0 }))
                              }}
                              data-testid="collect-ask"
                              style={{ width: 72 }}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="task-foot">
                <Btn kind="primary" onClick={sendRequest} disabled={sending || !lines.length} testId="collect-send">
                  {sending ? 'Sending…' : `Ask IGI for ${formatQty(askTotal)}`}
                </Btn>
                <span className="msg">
                  Suggested: back up to twice the alert level. Change any number before sending.
                </span>
              </div>
            </>
          )}
        </div>

        <ActionList
          title="Produce more"
          subtitle="IGI hold fewer than a level — theirs or ours. Ordering production takes about a month."
          models={toProduce}
          emptyText="IGI hold enough of every model, by their level and by ours."
          render={(m) => (m.order_status === 'order'
            ? { value: formatQty(m.pool), tone: 'now', label: `Below our level (${formatQty(m.order_min)})` }
            : { value: formatQty(m.pool), tone: POOL_TONE[m.pool_status], label: `Below IGI's level (${formatQty(m.pool_min)})` })}
          testId="list-produce"
        />
      </div>
    </>
  )
}

/** One of the two figures the module exists to answer. */
function BigStat({ label, value, note, tone, chip, testId }) {
  return (
    <div className="card" data-testid={testId}>
      <div className="card-head">
        <h3>{label}</h3>
        <span className="right"><Chip tone={tone}>{chip}</Chip></span>
      </div>
      <div className="card-body">
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 600,
          lineHeight: 1, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '.83rem', color: 'var(--ink-soft)' }}>{note}</p>
      </div>
    </div>
  )
}

/** The models needing something done to them, and what the something is. */
function ActionList({ title, subtitle, models, emptyText, render, testId }) {
  return (
    <div className="card" data-testid={testId}>
      <div className="card-head">
        <h3>{title}</h3>
        <span className="sub">{models.length}</span>
        <span className="right" style={{ fontSize: '.8rem', color: 'var(--ink-faint)' }}>{subtitle}</span>
      </div>
      {models.length === 0 ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <div className="tblwrap">
          <table style={{ minWidth: 0 }}>
            <tbody>
              {models.map((m) => {
                const r = render(m)
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{m.name}</div>
                      <SerialSpec model={m} compact />
                    </td>
                    <td className="num" style={{ fontWeight: 600, fontSize: '1.05rem' }}>{r.value}</td>
                    <td className="num"><Chip tone={r.tone}>{r.label}</Chip></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
