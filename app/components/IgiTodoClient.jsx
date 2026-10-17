'use client'

import { useState, useEffect } from 'react'
import { formatQty, visitRef } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import SerialSpec from './igi/SerialSpec'
import BatchPrintSheet from './igi/BatchPrintSheet'
import Chip from './igi/Chip'
import { ChangesTable, AddCard } from './igi/ProblemParts'
import { useIgiPortal } from './certificates/IgiPortalContext'
import { PageHead, Card, Loading, Note, Toast, Btn, Empty } from './certificates/ui'

/**
 * What LoveLab are waiting on.
 *
 * One card per request. Deliberately not a table, and deliberately not a
 * dashboard: somebody is standing at a bench with three hundred cards, and the
 * only question they need answered is how many of each to make.
 *
 * Three lists: the open requests, the new models to number, and — since
 * 16 Sept 2026 — the models below the level LoveLab want IGI to hold, which
 * is the one place IGI are told to produce more before being asked.
 */
export default function IgiTodoClient() {
  const { base, preview } = useIgiPortal()
  const [visits, setVisits] = useState([])
  const [newModels, setNewModels] = useState([])
  const [produce, setProduce] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [made, setMade] = useState({})
  const [serials, setSerials] = useState({})
  const [printing, setPrinting] = useState(null)
  const [catalogue, setCatalogue] = useState([])
  const [reporting, setReporting] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`${base}/todo`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not load your list')
      setVisits(body.visits || [])
      setNewModels(body.new_models || [])
      setProduce(body.produce || [])
      setCatalogue(body.catalogue || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // LoveLab added a model; IGI give it its number. Once, and for good.
  async function giveSerial(model) {
    setSavingId(model.id)
    try {
      const res = await fetch(`${base}/models/${model.id}/serial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: serials[model.id] || '' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not save the serial')
      setNotice(`${body.model.name} is now ${body.model.serial}. LoveLab can request it.`)
      setTimeout(() => setNotice(null), 6000)
      setNewModels((list) => list.filter((m) => m.id !== model.id))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function send(visit) {
    setSavingId(visit.id)
    try {
      const res = await fetch(`${base}/todo/${visit.id}/produce`, {
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

  // Something looks wrong with a request: put it on hold and tell LoveLab.
  async function reportProblem(visit, report) {
    setSavingId(visit.id)
    try {
      const res = await fetch(`${base}/todo/${visit.id}/problem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not report the problem')
      setNotice(`${visitRef(visit)} is on hold. LoveLab were told and will answer.`)
      setTimeout(() => setNotice(null), 6000)
      setReporting(null)
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
        sub={[
          visits.length === 0 ? null : `${visits.length} request${visits.length === 1 ? '' : 's'} from LoveLab`,
          newModels.length === 0 ? null : `${newModels.length} new model${newModels.length === 1 ? '' : 's'} to number`,
          produce.length === 0 ? null : `${produce.length} model${produce.length === 1 ? '' : 's'} to produce`,
        ].filter(Boolean).join(' · ') || 'Nothing waiting. LoveLab have not asked for anything.'}
      />

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}
      {notice && <Toast testId="notice">{notice}</Toast>}

      {newModels.length > 0 && (
        <div className="task" data-testid="new-models">
          <div className="task-h">
            <h2>New models from LoveLab</h2>
            <span className="ask">Give each its serial</span>
          </div>
          <div className="nextstep">
            <b>LoveLab added these. They need a serial from you before they can be requested.</b>
            <span>Type the number as you print it. It is set once and cannot be changed afterwards.</span>
          </div>
          {newModels.map((m) => (
            <div className="task-line" key={m.id} data-testid="new-model-line">
              <div className="who">
                <b>{m.name}</b>
                <SerialSpec model={m} compact />
                {m.requested_at && <span className="spec">asked {formatDate(m.requested_at)}</span>}
              </div>
              <div className="made" style={{ flex: '0 0 auto' }}>
                <label htmlFor={`serial-${m.id}`}>Serial</label>
                <input
                  id={`serial-${m.id}`}
                  type="text"
                  placeholder="LGAJ6600"
                  value={serials[m.id] ?? ''}
                  onChange={(e) => setSerials((s) => ({ ...s, [m.id]: e.target.value.toUpperCase() }))}
                  data-testid="serial-input"
                  style={{ fontFamily: 'var(--font-num)', width: 130 }}
                />
              </div>
              <Btn
                kind="primary"
                onClick={() => giveSerial(m)}
                disabled={savingId === m.id || !(serials[m.id] || '').trim()}
                testId="confirm-serial"
              >
                {savingId === m.id ? 'Saving…' : 'Confirm serial'}
              </Btn>
            </div>
          ))}
        </div>
      )}

      {produce.length > 0 && (
        <div className="task" data-testid="produce-more">
          <div className="task-h">
            <h2>Produce more</h2>
            <span className="ask">{produce.length} model{produce.length === 1 ? '' : 's'} below the level LoveLab want</span>
          </div>
          <div className="nextstep">
            <b>LoveLab want at least this many of each in your stock. You hold fewer.</b>
            <span>Production, about a month. LoveLab were told the same. Record what you make under Add a batch.</span>
          </div>
          {produce.map((m) => (
            <div className="task-line short" key={m.id} data-testid="produce-line">
              <div className="who">
                <b>{m.name}</b>
                <SerialSpec model={m} compact />
              </div>
              <div className="have">
                <span>You hold</span>
                <b style={{ color: 'var(--signal)' }}>{formatQty(Math.max(0, m.pool ?? 0))}</b>
              </div>
              <div className="have">
                <span>LoveLab want</span>
                <b>{formatQty(m.level)}</b>
              </div>
              <div className="have">
                <span>Short by</span>
                <b style={{ color: 'var(--signal)' }}>{formatQty(m.short_by)}</b>
              </div>
            </div>
          ))}
        </div>
      )}

      {visits.length === 0 && newModels.length === 0 && produce.length === 0 && !error && (
        <Card flush>
          <Empty>
            <span data-testid="empty">When LoveLab ask for certificates, the request appears here.</span>
          </Empty>
        </Card>
      )}

      {visits.map((visit) => {
        const short = visit.lines.filter((l) => l.short_by > 0)
        const asked = visit.lines.reduce((t, l) => t + l.qty_requested, 0)
        const onHold = visit.status === 'on_hold'
        return (
          <div className="task" key={visit.id} data-testid="todo-card">
            <div className="task-h">
              <h2>{visitRef(visit)}</h2>
              <span className="when">{formatDate(visit.visit_date)}</span>
              {onHold && <Chip tone="now">On hold</Chip>}
              <span className="ask">{formatQty(asked)} asked for</span>
              <Btn onClick={() => setPrinting(visit)} testId="print-request">Print sheet</Btn>
            </div>

            {onHold && (
              <div className="nextstep" data-testid="on-hold" style={{ background: 'var(--warn-tint)' }}>
                <b style={{ color: 'var(--warn)' }}>You reported a problem. LoveLab will answer.</b>
                <span>Nothing to make until then. It comes back here, corrected or confirmed, and you are emailed.</span>
                {visit.problem && (
                  <div style={{ marginTop: 10, width: '100%' }}>
                    <p style={{ margin: '0 0 8px' }}><i>“{visit.problem.note}”</i></p>
                    <ChangesTable changes={visit.problem.changes} askedLabel="They asked" suggestLabel="You suggested" />
                  </div>
                )}
              </div>
            )}

            {!onHold && short.length > 0 && (
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
                {!onHold && <div className="made">
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
                </div>}
              </div>
            ))}

            {!onHold && reporting === visit.id && (
              <ReportProblem
                visit={visit}
                catalogue={catalogue}
                saving={savingId === visit.id}
                onCancel={() => setReporting(null)}
                onSend={(report) => reportProblem(visit, report)}
              />
            )}

            {!onHold && reporting !== visit.id && (
              <div className="task-foot">
                <Btn
                  kind="primary"
                  onClick={() => send(visit)}
                  disabled={savingId === visit.id}
                  testId="send-to-lovelab"
                >
                  {savingId === visit.id ? 'Sending…' : 'Send back to LoveLab'}
                </Btn>
                <Btn onClick={() => setReporting(visit.id)} testId="report-problem">
                  Report a problem
                </Btn>
                <span className="msg">
                  Leave a model empty if you made everything they asked for.
                  {preview && ' Recorded against your name, not IGI’s.'}
                </span>
              </div>
            )}
          </div>
        )
      })}

      {printing && <BatchPrintSheet visit={printing} onDone={() => setPrinting(null)} />}
    </>
  )
}

/**
 * "Something is wrong with this request." What IGI think it should carry —
 * a new figure on a line, a card that is not on it — and a note. LoveLab
 * decide; nothing on the request changes until they do.
 */
function ReportProblem({ visit, catalogue, saving, onCancel, onSend }) {
  const [note, setNote] = useState('')
  const [should, setShould] = useState({})
  const [extra, setExtra] = useState([])
  const onRequest = new Set(visit.lines.map((l) => l.model_id))
  const taken = new Set([...onRequest, ...extra.map((e) => e.model_id)])
  const byId = new Map((catalogue || []).map((m) => [m.id, m]))

  function submit() {
    const proposal = [
      ...visit.lines
        .filter((l) => should[l.model_id] !== undefined && should[l.model_id] !== '')
        .map((l) => ({ model_id: l.model_id, qty: Number(should[l.model_id]) })),
      ...extra,
    ]
    onSend({ note, proposal })
  }

  return (
    <div className="nextstep" data-testid="report-form" style={{ display: 'block' }}>
      <b>What is wrong with {visitRef(visit)}?</b>
      <span style={{ display: 'block', margin: '4px 0 12px' }}>
        LoveLab are emailed and the request waits for their answer. Only fill in what should change.
      </span>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. 36 of these bracelets have 8 stones: they need LGAJ6575, not LGAJ6538."
        rows={3}
        maxLength={1000}
        data-testid="problem-note"
        style={{ width: '100%', marginBottom: 12 }}
      />

      {visit.lines.map((l) => (
        <div className="task-line" key={l.id} data-testid="problem-line" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div className="who">
            <b>{l.name}</b>
            <SerialSpec model={l} compact />
          </div>
          <div className="have">
            <span>They asked for</span>
            <b>{formatQty(l.qty_requested)}</b>
          </div>
          <div className="made">
            <label htmlFor={`should-${l.id}`}>Should be</label>
            <input
              id={`should-${l.id}`}
              type="number"
              min="0"
              placeholder={String(l.qty_requested)}
              value={should[l.model_id] ?? ''}
              onChange={(e) => setShould((s) => ({ ...s, [l.model_id]: e.target.value }))}
              data-testid="should-qty"
            />
          </div>
        </div>
      ))}

      {extra.map((e) => {
        const m = byId.get(e.model_id) || {}
        return (
          <div className="task-line" key={e.model_id} data-testid="problem-extra" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="who">
              <b>{m.name}</b>
              <SerialSpec model={m} compact />
            </div>
            <div className="have">
              <span>They asked for</span>
              <b>—</b>
            </div>
            <div className="have">
              <span>Add</span>
              <b>{formatQty(e.qty)}</b>
            </div>
            <Btn onClick={() => setExtra((list) => list.filter((x) => x.model_id !== e.model_id))}>Remove</Btn>
          </div>
        )
      })}

      <div style={{ margin: '12px 0' }}>
        <AddCard
          catalogue={catalogue}
          exclude={taken}
          onAdd={(modelId, qty) => setExtra((list) => [...list, { model_id: modelId, qty }])}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Btn kind="primary" onClick={submit} disabled={saving || !note.trim()} testId="send-problem">
          {saving ? 'Sending…' : 'Put on hold and tell LoveLab'}
        </Btn>
        <Btn onClick={onCancel} disabled={saving} testId="cancel-problem">Cancel</Btn>
      </div>
    </div>
  )
}
