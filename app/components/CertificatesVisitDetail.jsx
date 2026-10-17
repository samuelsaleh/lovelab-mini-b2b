'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatQty, visitRef } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import { VISIT_LABELS, VISIT_TONES, whyNotDeletable } from '@/lib/igi/visits'
import { Serial, Spec } from './igi/SerialSpec'
import Chip from './igi/Chip'
import Pipeline, { stepForStatus } from './igi/Pipeline'
import { ChangesTable, AddCard } from './igi/ProblemParts'
import { PageHead, Card, Loading, Note, Toast, Btn, TableWrap } from './certificates/ui'

/**
 * One movement, end to end.
 *
 * Receiving is one button: everything IGI made is taken as having come back. A
 * per-line figure only appears when somebody says something is short, because
 * naming every model on every return is the paperwork this replaces.
 */
export default function CertificatesVisitDetail({ visitId }) {
  const router = useRouter()
  const [visit, setVisit] = useState(null)
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [made, setMade] = useState({})
  const [shortReturn, setShortReturn] = useState(false)
  const [back, setBack] = useState({})
  const [emailing, setEmailing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [problem, setProblem] = useState(null)
  const [pastProblems, setPastProblems] = useState([])
  const [catalogue, setCatalogue] = useState([])

  useEffect(() => { load() }, [visitId])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/igi/visits/${visitId}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the movement')
      setVisit(body.visit)
      setLines(body.lines || [])
      setProblem(body.problem || null)
      setPastProblems(body.past_problems || [])
      setCatalogue(body.catalogue || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function post(path, payload, message) {
    setSaving(true)
    try {
      const res = await fetch(`/api/igi/visits/${visitId}/${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Something went wrong')
      setNotice(typeof message === 'function' ? message(body) : message)
      setTimeout(() => setNotice(null), 6000)
      setShortReturn(false)
      setBack({})
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // "Send the email again" — the request email to IGI failed the first time.
  async function resendEmail() {
    setEmailing(true)
    try {
      const res = await fetch(`/api/igi/visits/${visitId}/notify`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not send the email')
      if (body.email?.sent) {
        setNotice(`IGI emailed: ${body.email.recipients.join(', ')}.`)
        setTimeout(() => setNotice(null), 6000)
      } else {
        setError(`Still not sent: ${body.email?.error || body.email?.reason || 'unknown reason'}`)
      }
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setEmailing(false)
    }
  }

  // IGI reported a problem; LoveLab decide. accept | edit | keep.
  async function answer(payload) {
    setSaving(true)
    try {
      const res = await fetch(`/api/igi/visits/${visitId}/problem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not answer IGI')
      const told = body.email?.sent ? 'IGI were emailed.' : 'IGI could not be emailed, but they see it on their To do.'
      setNotice(`${visitRef(visit)} is back with IGI: ${formatQty(body.total)} certificates. ${told}`)
      setTimeout(() => setNotice(null), 8000)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/igi/visits/${visitId}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not delete the movement')
      router.push('/certificates/visits')
    } catch (err) {
      setError(err.message)
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  const short = useMemo(() => lines.filter((l) => l.short_by > 0), [lines])

  if (loading) return <Loading />
  if (!visit) return <Toast bad>{error || 'That movement does not exist.'}</Toast>

  const totalAsked = lines.reduce((t, l) => t + l.qty_requested, 0)
  const totalMade = lines.reduce((t, l) => t + (l.qty_issued ?? 0), 0)
  const totalBack = lines.reduce((t, l) => t + (l.qty_received ?? 0), 0)

  return (
    <>
      <PageHead
        title={visitRef(visit)}
        sub={visit.same_day_total
          ? `${formatDate(visit.visit_date)} · ${visit.same_day_position} of ${visit.same_day_total} that day`
          : formatDate(visit.visit_date)}
      >
        <Chip tone={VISIT_TONES[visit.status]}>{VISIT_LABELS[visit.status]}</Chip>
        {visit.correction && <Chip tone="a">Correction</Chip>}
        {visit.date_suspect && <Chip tone="a">Date mistyped in the file</Chip>}
      </PageHead>

      {visit.correction && (
        <Note testId="correction-note">
          <strong>This movement corrects the record; nothing crossed the road.</strong>
          {visit.note && <div style={{ marginTop: 6 }}>{visit.note}</div>}
        </Note>
      )}

      <Pipeline active={stepForStatus(visit.status)} title="Where this movement is" />

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}
      {notice && <Toast testId="notice">{notice}</Toast>}

      {visit.unattributed_total != null && (
        <Note warn testId="no-breakdown">
          <strong>{formatQty(visit.unattributed_total)} certificates, no models recorded</strong>
          <div style={{ marginTop: 6 }}>
            IGI recorded this movement as a daily total only. The certificates are counted but
            belong to no model. When the detail is reconstructed it goes in here and the balances
            correct themselves.
          </div>
        </Note>
      )}

      {visit.status === 'on_hold' && (
        <AnswerProblem
          problem={problem}
          lines={lines}
          catalogue={catalogue}
          saving={saving}
          onAnswer={answer}
        />
      )}

      {visit.status === 'requested' && (
        visit.notified_at ? (
          <p data-testid="email-sent" style={{ fontSize: '.83rem', color: 'var(--good)', margin: '0 0 12px' }}>
            IGI were emailed {formatWhen(visit.notified_at)}.
          </p>
        ) : (
          <Note warn testId="email-failed">
            <strong>IGI have not been emailed about this request.</strong>
            <div style={{ marginTop: 6 }}>
              {visit.notify_error || 'No email was sent for this movement.'} They will still see it on their To do.
            </div>
            <div style={{ marginTop: 10 }}>
              <Btn onClick={resendEmail} disabled={emailing} testId="email-retry">
                {emailing ? 'Sending…' : 'Send the email again'}
              </Btn>
            </div>
          </Note>
        )
      )}

      {short.length > 0 && visit.status === 'requested' && (
        <Note warn testId="shortage">
          <strong>IGI are short on {short.length} model{short.length > 1 ? 's' : ''}.</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {short.map((l) => (
              <li key={l.id}>
                {l.name} — asked {formatQty(l.qty_requested)}, they hold {formatQty(l.held)},
                short by {formatQty(l.short_by)}
              </li>
            ))}
          </ul>
        </Note>
      )}

      {visit.unattributed_total == null && (
        <Card flush>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Check</th>
                <th>Serial</th>
                  <th className="num">Asked</th>
                  <th className="num">IGI hold</th>
                  <th className="num">Made</th>
                  <th className="num">Back</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} data-testid="visit-line">
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.name}</div>
                      {l.short_by > 0 && visit.status === 'requested' && (
                        <div style={{ marginTop: 3 }}>
                          <Chip tone="watch">Short by {formatQty(l.short_by)}</Chip>
                        </div>
                      )}
                      {l.qty_issued != null && l.qty_issued < l.qty_requested && (
                        <div style={{ marginTop: 3 }}>
                          <Chip tone="watch">{formatQty(l.qty_requested - l.qty_issued)} fewer than asked</Chip>
                        </div>
                      )}
                    </td>
                    <td><Spec model={l} compact /></td>
                    <td><Serial model={l} compact /></td>
                    <td className="num">{formatQty(l.qty_requested)}</td>
                    <td className="num">{formatQty(l.held)}</td>
                    <td className="num">
                      {visit.status === 'requested' ? (
                        <input
                          type="number"
                          min="0"
                          placeholder={String(l.qty_requested)}
                          value={made[l.model_id] ?? ''}
                          onChange={(e) => setMade((m) => ({ ...m, [l.model_id]: e.target.value }))}
                          data-testid="made-qty"
                        />
                      ) : formatQty(l.qty_issued)}
                    </td>
                    <td className="num">
                      {visit.status === 'issued' && shortReturn ? (
                        <input
                          type="number"
                          min="0"
                          placeholder={String(l.qty_issued ?? 0)}
                          value={back[l.model_id] ?? ''}
                          onChange={(e) => setBack((b) => ({ ...b, [l.model_id]: e.target.value }))}
                          data-testid="back-qty"
                        />
                      ) : formatQty(l.qty_received)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td className="num">{formatQty(totalAsked)}</td>
                  <td className="num" />
                  <td className="num">{totalMade ? formatQty(totalMade) : '—'}</td>
                  <td className="num">{totalBack ? formatQty(totalBack) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        </Card>
      )}

      {/* ── The one action available at this step ─────────────────────────── */}
      {visit.status === 'requested' && visit.unattributed_total == null && (
        <Card
          title="What IGI made"
          sub="Leave a model blank if they made everything that was asked for. Fewer is normal."
        >
          <Btn
            kind="primary"
            onClick={() => post('issued', { issued: made }, 'Recorded. IGI’s stock has come down by that amount.')}
            disabled={saving}
            testId="confirm-made"
          >
            {saving ? 'Saving…' : 'Record what they made'}
          </Btn>
        </Card>
      )}

      {visit.status === 'issued' && (
        <Card
          title="Confirm the return"
          sub="One button takes everything IGI made as having come back. Only name models if something is short."
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Btn
              kind="primary"
              onClick={() => post(
                'received',
                { received: shortReturn ? back : {} },
                (body) => `Received — ${formatQty(body.received)} certificates.${receivedNote(body)}`,
              )}
              disabled={saving}
              testId="confirm-return"
            >
              {saving ? 'Saving…' : 'Confirm the return'}
            </Btn>
            <Btn
              kind={shortReturn ? 'on' : undefined}
              onClick={() => setShortReturn((v) => !v)}
              testId="toggle-short-return"
            >
              {shortReturn ? 'Everything came back' : 'Something is short'}
            </Btn>
          </div>
        </Card>
      )}

      {visit.status === 'closed' && (
        <p style={{ fontSize: '.83rem', color: 'var(--ink-faint)', maxWidth: 720, lineHeight: 1.6 }}>
          This movement is closed. A correction goes in as a new movement rather than a change
          here, so the history stays honest. What came back was written into LoveLab&rsquo;s own
          software (Certificate In) when the return was confirmed; the shelf figure here follows
          on the nightly read.
        </p>
      )}

      {pastProblems.length > 0 && (
        <div style={{ fontSize: '.83rem', color: 'var(--ink-soft)', maxWidth: 720, marginTop: 18 }} data-testid="past-problems">
          {pastProblems.map((p) => (
            <p key={p.id} style={{ margin: '0 0 6px' }}>
              IGI reported a problem {formatWhen(p.reported_at)}: <i>“{p.note}”</i>{' '}
              LoveLab {RESOLUTION_WORDS[p.resolution] || 'answered'} {formatWhen(p.resolved_at)}.
              {p.reply && <> Reply: <i>“{p.reply}”</i></>}
            </p>
          ))}
        </div>
      )}

      <DeleteMovement
        visit={visit}
        returning={totalMade}
        confirming={confirmingDelete}
        deleting={deleting}
        onAsk={() => setConfirmingDelete(true)}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={remove}
      />
    </>
  )
}

/**
 * Clearing out a movement that was only ever a test.
 *
 * Deliberately at the bottom, behind two clicks, and refused outright on the
 * movements that came from IGI's file — those are the real history and no
 * amount of clicking should reach them.
 *
 * There is no "and put the stock back" step because there is nothing to put
 * back: IGI's figure is derived as what they made less what they issued, so
 * removing the lines corrects it by arithmetic. That is worth saying on the
 * screen, because "delete" next to a stock number usually means somebody has
 * to remember to undo something too.
 */
function DeleteMovement({ visit, returning, confirming, deleting, onAsk, onCancel, onConfirm }) {
  const refusal = whyNotDeletable(visit)

  if (refusal) {
    return (
      <p style={{ fontSize: '.8rem', color: 'var(--ink-faint)', maxWidth: 720, marginTop: 24 }}
         data-testid="delete-refused">
        {refusal}
      </p>
    )
  }

  return (
    <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid var(--rule)' }}>
      {!confirming ? (
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Btn onClick={onAsk} testId="delete-movement">Delete this movement</Btn>
          <span style={{ fontSize: '.83rem', color: 'var(--ink-faint)' }}>
            For clearing out a test. Imported history cannot be deleted.
          </span>
        </div>
      ) : (
        <div className="card" style={{ borderColor: 'var(--signal)' }} data-testid="delete-confirm">
          <div className="card-head" style={{ background: 'var(--signal-tint)' }}>
            <h3 style={{ color: 'var(--signal)' }}>Delete {visitRef(visit)}?</h3>
          </div>
          <div className="card-body">
            <p style={{ margin: '0 0 10px' }}>
              The movement and its lines go for good. This cannot be undone.
            </p>
            <p style={{ margin: 0, fontSize: '.87rem', color: 'var(--ink-soft)' }}>
              {returning > 0 ? (
                <>
                  <strong>{formatQty(returning)} certificates</strong> go back into IGI&rsquo;s stock,
                  because their figure is worked out from the movements rather than stored.
                </>
              ) : (
                <>Nothing was issued on it, so no stock figure changes.</>
              )}{' '}
              Our own shelf is unaffected either way — it comes from the nightly read of
              LoveLab&rsquo;s software, not from movements.
            </p>
          </div>
          <div className="task-foot">
            <Btn kind="danger" onClick={onConfirm} disabled={deleting} testId="delete-confirmed">
              {deleting ? 'Deleting…' : 'Yes, delete it'}
            </Btn>
            <Btn onClick={onCancel} disabled={deleting} testId="delete-cancel">Keep it</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

const RESOLUTION_WORDS = {
  accepted: 'accepted IGI’s correction',
  edited: 'changed the request',
  kept: 'kept the request as it was',
}

/**
 * IGI stopped on this request and said why (Mika, 16 Oct 2026). Three
 * answers: take IGI's correction as it stands, change the request by hand, or
 * keep it. Each sends it back to IGI's To do and emails them.
 */
function AnswerProblem({ problem, lines, catalogue, saving, onAnswer }) {
  const [reply, setReply] = useState('')
  const [editing, setEditing] = useState(false)
  const [qty, setQty] = useState({})
  const [extra, setExtra] = useState([])

  const changes = problem?.changes || []

  function startEditing() {
    // Start from IGI's suggestion: it is usually most of the answer.
    const start = {}
    for (const l of lines) start[l.model_id] = String(l.qty_requested)
    const added = []
    for (const c of changes) {
      if (c.from == null) added.push({ model_id: c.model_id, qty: c.to })
      else start[c.model_id] = String(c.to)
    }
    setQty(start)
    setExtra(added)
    setEditing(true)
  }

  function saveEdit() {
    const out = [
      ...lines.map((l) => ({ model_id: l.model_id, qty: Number(qty[l.model_id] ?? l.qty_requested) })),
      ...extra,
    ]
    onAnswer({ action: 'edit', lines: out, reply })
  }

  const byId = new Map((catalogue || []).map((m) => [m.id, m]))
  const taken = new Set([...lines.map((l) => l.model_id), ...extra.map((e) => e.model_id)])

  return (
    <div className="card" style={{ borderColor: 'var(--warn)' }} data-testid="problem-card">
      <div className="card-head" style={{ background: 'var(--warn-tint)' }}>
        <h3 style={{ color: 'var(--warn)' }}>IGI reported a problem</h3>
        {problem?.reported_at && <span className="sub">{formatWhen(problem.reported_at)}</span>}
      </div>
      <div className="card-body">
        {problem ? (
          <>
            <p style={{ margin: '0 0 12px' }}><i>“{problem.note}”</i></p>
            {!editing && <ChangesTable changes={changes} askedLabel="You asked" />}
          </>
        ) : (
          <p style={{ margin: 0 }}>The request is on hold, but IGI’s note could not be found.</p>
        )}

        {editing && (
          <div data-testid="edit-request">
            <TableWrap>
              <table>
                <thead>
                  <tr><th>Model</th><th>Serial</th><th>Spec</th><th className="num">Asked</th><th className="num">New</th></tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} data-testid="edit-line">
                      <td style={{ fontWeight: 600 }}>{l.name}</td>
                      <td><Serial model={l} compact /></td>
                      <td><Spec model={l} compact /></td>
                      <td className="num">{formatQty(l.qty_requested)}</td>
                      <td className="num">
                        <input
                          type="number"
                          min="0"
                          value={qty[l.model_id] ?? ''}
                          onChange={(e) => setQty((q) => ({ ...q, [l.model_id]: e.target.value }))}
                          data-testid="edit-qty"
                        />
                      </td>
                    </tr>
                  ))}
                  {extra.map((e) => {
                    const m = byId.get(e.model_id) || {}
                    return (
                      <tr key={e.model_id} data-testid="edit-extra">
                        <td style={{ fontWeight: 600 }}>{m.name}</td>
                        <td><Serial model={m} compact /></td>
                        <td><Spec model={m} compact /></td>
                        <td className="num">—</td>
                        <td className="num">
                          <input
                            type="number"
                            min="0"
                            value={e.qty}
                            onChange={(ev) => {
                              const n = Number(ev.target.value)
                              setExtra((list) => list.map((x) => (x.model_id === e.model_id ? { ...x, qty: Number.isInteger(n) && n >= 0 ? n : 0 } : x)))
                            }}
                            data-testid="edit-extra-qty"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableWrap>
            <div style={{ margin: '12px 0' }}>
              <AddCard
                catalogue={catalogue}
                exclude={taken}
                onAdd={(modelId, n) => setExtra((list) => [...list, { model_id: modelId, qty: n }])}
              />
            </div>
            <p style={{ fontSize: '.83rem', color: 'var(--ink-faint)', margin: 0 }}>0 takes a model off the request.</p>
          </div>
        )}

        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="A word back to IGI (optional)"
          rows={2}
          maxLength={1000}
          data-testid="problem-reply"
          style={{ width: '100%', marginTop: 14 }}
        />
      </div>
      <div className="task-foot">
        {!editing ? (
          <>
            {changes.length > 0 && (
              <Btn kind="primary" onClick={() => onAnswer({ action: 'accept', reply })} disabled={saving} testId="accept-problem">
                {saving ? 'Saving…' : 'Accept IGI’s correction'}
              </Btn>
            )}
            <Btn onClick={startEditing} disabled={saving} testId="edit-problem">Edit it myself</Btn>
            <Btn onClick={() => onAnswer({ action: 'keep', reply })} disabled={saving} testId="keep-problem">
              Keep as it was
            </Btn>
          </>
        ) : (
          <>
            <Btn kind="primary" onClick={saveEdit} disabled={saving} testId="save-edit">
              {saving ? 'Saving…' : 'Save and send back to IGI'}
            </Btn>
            <Btn onClick={() => setEditing(false)} disabled={saving} testId="cancel-edit">Cancel</Btn>
          </>
        )}
        <span className="msg">IGI are emailed your answer and the request goes back on their To do.</span>
      </div>
    </div>
  )
}

/** "on 18 Sept 2026 at 10:32", Antwerp time. */
function formatWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })
  return `on ${day} at ${time}`
}

/** What the return notice adds when something was missing. */
function receivedNote(body) {
  if (!body?.missing) return ''
  const n = formatQty(body.missing)
  if (body.email?.sent) return ` ${n} missing — IGI were told.`
  if (body.email?.reason === 'no_recipients') return ` ${n} missing — no IGI address to tell.`
  return ` ${n} missing — IGI could not be emailed.`
}
