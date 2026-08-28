'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatQty } from '@/lib/igi/derive'
import SerialSpec from './igi/SerialSpec'
import Chip from './igi/Chip'
import Pipeline from './igi/Pipeline'
import { PageHead, Card, Loading, Note, Toast, Btn, TableWrap, Empty } from './certificates/ui'

/**
 * Choosing what to ask IGI for.
 *
 * Asking for more than IGI holds is allowed — the warning is there so nobody
 * walks across the road expecting 500 and comes back with 41.
 */
export default function CertificatesRequestClient() {
  const router = useRouter()
  const [models, setModels] = useState([])
  const [draft, setDraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/overview')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the models')
      // Only models with a serial and a quantity can be asked for.
      setModels((body.models || []).filter((m) => m.state === 'in_use'))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const chosen = useMemo(
    () => models.filter((m) => draft[m.id] > 0),
    [models, draft],
  )
  const short = useMemo(
    () => chosen.filter((m) => m.pool != null && draft[m.id] > m.pool),
    [chosen, draft],
  )
  const total = chosen.reduce((t, m) => t + draft[m.id], 0)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => `${m.name} ${m.serial} ${m.shape}`.toLowerCase().includes(q))
  }, [models, query])

  async function send() {
    setSending(true)
    try {
      const res = await fetch('/api/igi/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: chosen.map((m) => ({ model_id: m.id, qty: draft[m.id] })),
        }),
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

  return (
    <>
      <PageHead title="New request" sub="Choose the models and how many of each. IGI see it as soon as you send." />

      <Pipeline active={0} />

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}

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

      {/* ── What is about to be sent, and the one button that sends it ────── */}
      <div className="card">
        <div className="crow" data-testid="request-total">
          <div className="k">
            Asking for
            <small>across {chosen.length} model{chosen.length === 1 ? '' : 's'}</small>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span className="v">{formatQty(total)}</span>
            <Btn kind="primary" onClick={send} disabled={sending || !chosen.length} testId="send-request">
              {sending ? 'Sending…' : 'Send to IGI'}
            </Btn>
          </div>
        </div>
      </div>

      <Card
        title="Models"
        sub={`${shown.length} of ${models.length}`}
        head={
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a name or serial"
            data-testid="search"
            style={{ width: 240 }}
          />
        }
        flush
      >
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Serial · check</th>
                <th className="num">IGI hold</th>
                <th className="num">On our shelf</th>
                <th className="num">Ask for</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => {
                const asked = draft[m.id] || 0
                const isShort = m.pool != null && asked > m.pool
                return (
                  <tr key={m.id} data-testid="request-row">
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      {isShort && (
                        <div style={{ marginTop: 3 }}>
                          <Chip tone="watch">Short by {formatQty(asked - m.pool)}</Chip>
                        </div>
                      )}
                    </td>
                    <td><SerialSpec model={m} compact /></td>
                    <td className="num">{formatQty(m.pool)}</td>
                    <td className="num">
                      {m.shelf == null
                        ? <span className="spec">not mapped</span>
                        : formatQty(m.shelf)}
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min="0"
                        value={draft[m.id] ?? ''}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setDraft((d) => ({
                            ...d,
                            [m.id]: Number.isInteger(n) && n >= 0 ? n : 0,
                          }))
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
        {shown.length === 0 && <Empty>No model matches that search.</Empty>}
      </Card>
    </>
  )
}
