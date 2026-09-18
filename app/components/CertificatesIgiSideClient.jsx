'use client'

import { useState, useEffect } from 'react'
import { formatQty, visitRef, sameDayLabel } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import { VISIT_LABELS, VISIT_TONES } from '@/lib/igi/visits'
import { Serial, Spec } from './igi/SerialSpec'
import Chip from './igi/Chip'
import Link from 'next/link'
import { PageHead, Card, Loading, Note, Toast, Switch, TableWrap, Empty } from './certificates/ui'

const TABS = [
  { value: 'todo', label: 'Their to do' },
  { value: 'stock', label: 'Their stock' },
  { value: 'history', label: 'Their history' },
]

/**
 * IGI's side of the road, from LoveLab's chair.
 *
 * Two questions this answers. Before IGI have a login: what exactly am I about
 * to show another company? After they have one: what is on their screen right
 * now, without borrowing their password.
 *
 * Everything here comes from /api/igi/their-side, which runs IGI's own loader
 * and their own shapers — so this page cannot show more than they can see, and
 * it cannot drift from their portal without their portal changing first.
 *
 * Read only, deliberately. Recording production is IGI's to do, and a LoveLab
 * admin quietly typing it for them is how a shared record stops being shared.
 */
export default function CertificatesIgiSideClient() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('todo')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/their-side')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load IGI’s side')
      setData(body)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Loading />

  const todo = data?.todo || []
  const models = data?.models || []
  const produce = data?.produce || []
  const waiting = todo.reduce((t, v) => t + v.lines.reduce((n, l) => n + l.qty_requested, 0), 0)
  const low = models.filter(belowLevel)

  return (
    <>
      <PageHead
        title="IGI’s side"
        sub={`${todo.length} request${todo.length === 1 ? '' : 's'} on their desk, ${formatQty(waiting)} certificates asked for`}
      >
        <Switch testId="igi-tab" value={tab} onChange={setTab} options={TABS} />
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}

      <Note testId="mirror-note">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 320 }}>
            This is <strong>exactly</strong> what IGI Antwerp see when they sign in — same
            figures, built from their own screens rather than a copy of them. They see the level we
            want them to hold and can correct their own count; they never see our shelf, our shelf
            level, how fast anything sells, the reserved serials, or the matching table. Read only:
            recording what they produced or hold is theirs to do.
          </span>
          <Link href="/igi" className="btn primary" data-testid="open-their-portal">
            Open their portal →
          </Link>
        </div>
      </Note>

      {tab === 'todo' && <TheirTodo visits={todo} produce={produce} />}
      {tab === 'stock' && <TheirStock models={models} low={low.length} />}
      {tab === 'history' && <TheirHistory visits={data?.visits || []} batches={data?.batches || []} counts={data?.counts || []} />}
    </>
  )
}

/** What is on their bench right now: the requests, and what we want produced. */
function TheirTodo({ visits, produce }) {
  if (!visits.length && !produce.length) {
    return (
      <Card flush>
        <Empty>
          <span data-testid="their-todo-empty">
            Nothing is waiting on IGI. Their To do screen is empty.
          </span>
        </Empty>
      </Card>
    )
  }

  return (
    <>
      {produce.length > 0 && <TheirProduce models={produce} />}
      {visits.map((visit) => <TheirRequest key={visit.id} visit={visit} />)}
    </>
  )
}

/** The models below the level we set — the "Produce more" list on their To do. */
function TheirProduce({ models }) {
  return (
    <Card
      title="Produce more"
      sub={`${models.length} model${models.length === 1 ? '' : 's'} below the level we set — they see this list too`}
      flush
      testId="their-produce"
    >
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Check</th>
              <th>Serial</th>
              <th className="num">They hold</th>
              <th className="num">We want at least</th>
              <th className="num">Short by</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} data-testid="their-produce-line">
                <td style={{ fontWeight: 600 }}>{m.name}</td>
                <td><Spec model={m} compact /></td>
                <td><Serial model={m} compact /></td>
                <td className="num" style={{ color: 'var(--signal)', fontWeight: 600 }}>{formatQty(m.pool)}</td>
                <td className="num">{formatQty(m.level)}</td>
                <td className="num" style={{ color: 'var(--signal)' }}>{formatQty(m.short_by)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  )
}

/** One open request, as they see it. */
function TheirRequest({ visit }) {
  const short = visit.lines.filter((l) => l.short_by > 0)
  const asked = visit.lines.reduce((t, l) => t + l.qty_requested, 0)
  return (
      <div className="task" data-testid="their-todo-card">
        <div className="task-h">
          <h2>{visitRef(visit)}</h2>
          <span className="when">{formatDate(visit.visit_date)}</span>
          <span className="ask">{formatQty(asked)} asked for</span>
        </div>

        {short.length > 0 && (
          <div className="nextstep" style={{ background: 'var(--warn-tint)' }} data-testid="their-shortage">
            <b style={{ color: 'var(--warn)' }}>
              They are short on {short.length} model{short.length > 1 ? 's' : ''}.
            </b>
            <span>They will see this too, and can send back what they actually made.</span>
          </div>
        )}

        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Check</th>
                <th>Serial</th>
                <th className="num">We asked for</th>
                <th className="num">They hold</th>
              </tr>
            </thead>
            <tbody>
              {visit.lines.map((l) => (
                <tr key={l.id} data-testid="their-todo-line">
                  <td style={{ fontWeight: 600 }}>{l.name}</td>
                  <td><Spec model={l} compact /></td>
                  <td><Serial model={l} compact /></td>
                  <td className="num">{formatQty(l.qty_requested)}</td>
                  <td className="num">
                    {formatQty(l.held)}
                    {l.short_by > 0 && (
                      <div style={{ color: 'var(--signal)', fontSize: '.78rem' }}>
                        short by {formatQty(l.short_by)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
  )
}

/** Their stock, the level we want them to hold, and the order book they see. */
function TheirStock({ models, low }) {
  return (
    <Card
      title="What IGI hold"
      sub={low > 0 ? `${low} below the level we set` : 'Nothing below the level we set'}
      flush
    >
      <TableWrap>
        <table style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Model</th>
              <th>Check</th>
              <th>Serial</th>
              <th className="num">They hold</th>
              <th className="num">We want at least</th>
              <th className="num">We are asking</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const short = belowLevel(m) ? m.level - m.pool : 0
              return (
                <tr key={m.id} data-testid="their-stock-row">
                  <td>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    {short > 0 && (
                      <div style={{ marginTop: 3 }}>
                        <Chip tone="now">Produce more</Chip>
                        <span className="spec" style={{ marginLeft: 6 }}>short by {formatQty(short)}</span>
                      </div>
                    )}
                  </td>
                  <td><Spec model={m} compact /></td>
                  <td><Serial model={m} compact /></td>
                  <td className="num">{formatQty(m.pool)}</td>
                  <td className="num">
                    {m.level == null ? <span className="spec">no level</span> : formatQty(m.level)}
                  </td>
                  <td className="num">
                    {m.asked_now ? <strong>{formatQty(m.asked_now)}</strong> : <span className="spec">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      {models.length === 0 && <Empty>No models yet.</Empty>}
    </Card>
  )
}

/** Movements, the production batches IGI have recorded, and the counts they corrected. */
function TheirHistory({ visits, batches, counts = [] }) {
  return (
    <>
      <Card title="Movements" sub={`${visits.length}`} flush>
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Movement</th>
                <th>Date</th>
                <th>Where it is</th>
                <th className="num">Certificates</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id} data-testid="their-history-visit">
                  <td className="mono" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    {visitRef(v)}
                    {sameDayLabel(v, visits) && (
                      <span style={{ marginLeft: 6, color: 'var(--ink-faint)', fontWeight: 400 }}>
                        {sameDayLabel(v, visits)}
                      </span>
                    )}
                  </td>
                  <td>
                    {formatDate(v.visit_date)}
                    {(v.date_suspect || v.correction) && (
                      <div style={{ marginTop: 3, display: 'flex', gap: 5 }}>
                        {v.correction && <Chip tone="a">Correction</Chip>}
                        {v.date_suspect && <Chip tone="a">Date mistyped</Chip>}
                      </div>
                    )}
                  </td>
                  <td><Chip tone={VISIT_TONES[v.status]}>{VISIT_LABELS[v.status]}</Chip></td>
                  <td className="num">
                    {formatQty(v.total)}
                    {v.unattributed_total != null && <div className="spec">no models recorded</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {visits.length === 0 && <Empty>No movements yet.</Empty>}
      </Card>

      <Card title="Production batches" sub={`${batches.length}`} flush>
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Serial</th>
                <th>Date made</th>
                <th>Their reference</th>
                <th className="num">How many</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} data-testid="their-history-batch">
                  <td style={{ fontWeight: 600 }}>{b.name}</td>
                  <td className="mono">{b.serial}</td>
                  <td>{formatDate(b.batch_date)}</td>
                  <td className="mono">{b.reference || '—'}</td>
                  <td className="num">{formatQty(b.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {batches.length === 0 && <Empty>IGI have not recorded any production yet.</Empty>}
      </Card>

      <Card title="Stock corrections" sub={`${counts.length}`} flush testId="their-counts">
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Serial</th>
                <th>When</th>
                <th className="num">App said</th>
                <th className="num">They counted</th>
                <th className="num">Difference</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id} data-testid="their-history-count">
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="mono">{c.serial}</td>
                  <td>{formatDate(String(c.counted_at).slice(0, 10))}</td>
                  <td className="num">{formatQty(c.was)}</td>
                  <td className="num">{formatQty(c.counted)}</td>
                  <td className="num" style={{ color: c.delta < 0 ? 'var(--signal)' : 'var(--good)' }}>
                    {c.delta > 0 ? '+' : ''}{formatQty(c.delta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {counts.length === 0 && <Empty>IGI have not corrected a count yet.</Empty>}
      </Card>
    </>
  )
}

/** Below the level we want IGI to hold. No level means no rule. */
function belowLevel(m) {
  return m.level != null && m.pool != null && m.pool < m.level
}
