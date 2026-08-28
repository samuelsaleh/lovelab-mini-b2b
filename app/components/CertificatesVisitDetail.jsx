'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatQty, visitRef } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import { VISIT_LABELS, VISIT_TONES } from '@/lib/igi/visits'
import SerialSpec from './igi/SerialSpec'
import Chip from './igi/Chip'
import Pipeline, { stepForStatus } from './igi/Pipeline'
import { PageHead, Card, Loading, Note, Toast, Btn, TableWrap } from './certificates/ui'

/**
 * One movement, end to end.
 *
 * Receiving is one button: everything IGI made is taken as having come back. A
 * per-line figure only appears when somebody says something is short, because
 * naming every model on every return is the paperwork this replaces.
 */
export default function CertificatesVisitDetail({ visitId }) {
  const [visit, setVisit] = useState(null)
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [made, setMade] = useState({})
  const [shortReturn, setShortReturn] = useState(false)
  const [back, setBack] = useState({})

  useEffect(() => { load() }, [visitId])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/igi/visits/${visitId}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the movement')
      setVisit(body.visit)
      setLines(body.lines || [])
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
        {visit.date_suspect && <Chip tone="a">Date mistyped in the file</Chip>}
      </PageHead>

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
                  <th>Serial · check</th>
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
                    <td><SerialSpec model={l} compact /></td>
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
                  <td colSpan={2}>Total</td>
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
                (body) => `Received — ${formatQty(body.received)} certificates.`,
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
          here, so the history stays honest. The certificates are not yet written into LoveLab&rsquo;s
          own software automatically — until that endpoint exists, the shelf figure still comes
          from the nightly read alone.
        </p>
      )}
    </>
  )
}
