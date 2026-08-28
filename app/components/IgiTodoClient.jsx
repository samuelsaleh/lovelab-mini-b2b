'use client'

import { useState, useEffect } from 'react'
import { formatQty, visitRef } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import SerialSpec from './igi/SerialSpec'
import { PageHead, Card, Loading, Note, Toast, Btn, Empty } from './certificates/ui'

/**
 * What LoveLab are waiting on.
 *
 * One card per request. Deliberately not a table, and deliberately not a
 * dashboard: somebody is standing at a bench with three hundred cards, and the
 * only question they need answered is how many of each to make.
 */
export default function IgiTodoClient() {
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [made, setMade] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi-portal/todo')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not load your list')
      setVisits(body.visits || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function send(visit) {
    setSavingId(visit.id)
    try {
      const res = await fetch(`/api/igi-portal/todo/${visit.id}/produce`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ made: made[visit.id] || {} }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not save what you made')
      setNotice(`Sent — ${formatQty(body.made)} certificates back to LoveLab.`)
      setTimeout(() => setNotice(null), 6000)
      setMade((m) => ({ ...m, [visit.id]: {} }))
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <Loading />

  return (
    <>
      <PageHead
        title="To do"
        sub={visits.length === 0
          ? 'Nothing waiting. LoveLab have not asked for anything.'
          : `${visits.length} request${visits.length === 1 ? '' : 's'} from LoveLab`}
      />

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}
      {notice && <Toast testId="notice">{notice}</Toast>}

      {visits.length === 0 && !error && (
        <Card flush>
          <Empty>
            <span data-testid="empty">When LoveLab ask for certificates, the request appears here.</span>
          </Empty>
        </Card>
      )}

      {visits.map((visit) => {
        const short = visit.lines.filter((l) => l.short_by > 0)
        const asked = visit.lines.reduce((t, l) => t + l.qty_requested, 0)
        return (
          <div className="task" key={visit.id} data-testid="todo-card">
            <div className="task-h">
              <h2>{visitRef(visit)}</h2>
              <span className="when">{formatDate(visit.visit_date)}</span>
              <span className="ask">{formatQty(asked)} asked for</span>
            </div>

            {short.length > 0 && (
              <div className="nextstep" data-testid="shortage" style={{ background: 'var(--warn-tint)' }}>
                <b style={{ color: 'var(--warn)' }}>
                  You hold fewer than they asked for on {short.length} model{short.length > 1 ? 's' : ''}.
                </b>
                <span>Make what you can — put the real number in, LoveLab will see it.</span>
              </div>
            )}

            {visit.lines.map((line) => (
              <div
                className={line.short_by > 0 ? 'task-line short' : 'task-line'}
                key={line.id}
                data-testid="todo-line"
              >
                <div className="who">
                  <b>{line.name}</b>
                  <SerialSpec model={line} compact />
                </div>
                <div className="have">
                  <span>They asked for</span>
                  <b>{formatQty(line.qty_requested)}</b>
                </div>
                <div className="have">
                  <span>You hold</span>
                  <b style={line.short_by > 0 ? { color: 'var(--signal)' } : undefined}>
                    {formatQty(line.held)}
                  </b>
                  {line.short_by > 0 && (
                    <span style={{ color: 'var(--signal)' }}>short by {formatQty(line.short_by)}</span>
                  )}
                </div>
                <div className="made">
                  <label htmlFor={`made-${line.id}`}>You made</label>
                  <input
                    id={`made-${line.id}`}
                    type="number"
                    min="0"
                    placeholder={String(line.qty_requested)}
                    value={made[visit.id]?.[line.model_id] ?? ''}
                    onChange={(e) => setMade((m) => ({
                      ...m,
                      [visit.id]: { ...(m[visit.id] || {}), [line.model_id]: e.target.value },
                    }))}
                    data-testid="made-qty"
                  />
                </div>
              </div>
            ))}

            <div className="task-foot">
              <Btn kind="primary" onClick={() => send(visit)} disabled={savingId === visit.id} testId="send-to-lovelab">
                {savingId === visit.id ? 'Sending…' : 'Send back to LoveLab'}
              </Btn>
              <span className="msg">Leave a model empty if you made everything they asked for.</span>
            </div>
          </div>
        )
      })}
    </>
  )
}
