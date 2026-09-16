'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatQty, suggestedAsk } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import SerialSpec from './igi/SerialSpec'
import Chip from './igi/Chip'
import { PageHead, Loading, Toast, Btn, Empty } from './certificates/ui'

/**
 * The front page: two lists, and nothing else.
 *
 *   Go collect    — below our shelf level. IGI already hold them; it is a walk
 *                   across the road. The request is prefilled and one button
 *                   sends it.
 *   Order at IGI  — below the level we want IGI to hold. Production, about a
 *                   month. IGI see the same list on their To do.
 *
 * Sam, 16 Sept 2026: the old dashboard was useful for exactly these two lists
 * and for nothing around them — the big totals, the unattributed-certificates
 * note, the reserved count, the unlinked-descriptions note. All of that went.
 * The totals live on Stock's facts line; the gap lives on Movements, on the
 * days it belongs to.
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
    () => (data?.models || []).filter((m) => m.state === 'in_use' && m.shelf_status === 'collect'),
    [data],
  )
  const toOrder = useMemo(
    () => (data?.models || []).filter((m) => m.state === 'in_use' && m.order_status === 'order'),
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

  const lastRead = data?.shelf?.last_read

  return (
    <>
      <PageHead
        title="Dashboard"
        sub={lastRead ? `Shelf read on ${formatDate(lastRead)}` : 'Shelf not read yet'}
      >
        <Btn onClick={() => router.push('/certificates/stock')} testId="go-stock">Stock →</Btn>
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}

      <div className="split">
        {/* ── Go collect: the request, ready to send ───────────────────────── */}
        <div className="card" data-testid="list-collect">
          <div className="card-head">
            <h3>Go collect</h3>
            <span className="sub">{toCollect.length}</span>
            <span className="right" style={{ fontSize: '.8rem', color: 'var(--ink-faint)' }}>
              Below our shelf level. IGI already hold them.
            </span>
          </div>
          {toCollect.length === 0 ? (
            <Empty>Every model is above its shelf level.</Empty>
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
                  Suggested: back up to twice the shelf level. Change any number before sending.
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Order at IGI: what they must produce ─────────────────────────── */}
        <div className="card" data-testid="list-produce">
          <div className="card-head">
            <h3>Order at IGI</h3>
            <span className="sub">{toOrder.length}</span>
            <span className="right" style={{ fontSize: '.8rem', color: 'var(--ink-faint)' }}>
              Below the level we set. IGI see this list on their To do.
            </span>
          </div>
          {toOrder.length === 0 ? (
            <Empty>IGI hold enough of every model, by the level we set.</Empty>
          ) : (
            <div className="tblwrap">
              <table style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th className="num">IGI hold</th>
                    <th className="num">Our level</th>
                    <th className="num">Short by</th>
                  </tr>
                </thead>
                <tbody>
                  {toOrder.map((m) => (
                    <tr key={m.id} data-testid="produce-row">
                      <td>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{m.name}</div>
                        <SerialSpec model={m} compact />
                      </td>
                      <td className="num"><b style={{ color: 'var(--signal)' }}>{formatQty(m.pool)}</b></td>
                      <td className="num">{formatQty(m.order_min)}</td>
                      <td className="num"><Chip tone="now">short by {formatQty(m.order_min - m.pool)}</Chip></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
