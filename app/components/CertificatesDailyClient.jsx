'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatQty, visitRef } from '@/lib/igi/derive'
import { formatDate, formatMonth } from '@/lib/igi/dates'
import { Serial, Spec } from './igi/SerialSpec'
import Chip from './igi/Chip'
import { PageHead, Card, Loading, Note, Toast, TableWrap, Empty, Btn } from './certificates/ui'

/**
 * What was taken, day by day.
 *
 * The Visits screen answers "what happened on movement 22". This one answers
 * "what went across on the 25th", which is the question people actually ask —
 * and which used to mean opening two movements and adding them up, because a
 * busy day is often two movements.
 *
 * A day whose total is larger than its models add up to is not a bug: those are
 * the imported movements that recorded a daily total and named no model. They
 * are shown as their own line rather than spread across models that did not
 * earn them.
 */
export default function CertificatesDailyClient() {
  const router = useRouter()
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openDate, setOpenDate] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/daily')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the daily history')
      setDays(body.days || [])
      // The most recent day opens by itself — it is the one being asked about.
      setOpenDate(body.days?.[0]?.date ?? null)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totals = useMemo(() => days.reduce((t, d) => ({
    total: t.total + d.total,
    unattributed: t.unattributed + d.unattributed,
  }), { total: 0, unattributed: 0 }), [days])

  if (loading) return <Loading />

  return (
    <>
      <PageHead
        title="Daily history"
        sub={days.length
          ? `${days.length} day${days.length === 1 ? '' : 's'} on which certificates moved, ${formatQty(totals.total)} in total`
          : 'Nothing has moved yet'}
      />

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}

      {totals.unattributed > 0 && (
        <Note warn testId="daily-gap-note">
          <strong>{formatQty(totals.unattributed)}</strong> of these were recorded as a daily
          total with no model named. Those days show the figure but no breakdown, and their total
          is larger than their models add up to. That is the truth of what was written down, not
          an error in the arithmetic.
        </Note>
      )}

      {days.length === 0 && !error && (
        <Card flush><Empty><span data-testid="daily-empty">
          No certificates have moved yet. Send a request to IGI and the day will appear here.
        </span></Empty></Card>
      )}

      {days.map((day) => (
        <Day
          key={day.date}
          day={day}
          open={openDate === day.date}
          onToggle={() => setOpenDate(openDate === day.date ? null : day.date)}
          onOpenVisit={(id) => router.push(`/certificates/visits/${id}`)}
        />
      ))}
    </>
  )
}

/** One day, closed to a single line until you want the models. */
function Day({ day, open, onToggle, onOpenVisit }) {
  const noBreakdown = day.unattributed > 0

  return (
    <section className="card" data-testid="daily-day">
      <div
        className="card-head"
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
        data-testid="daily-day-head"
      >
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>
          {formatDate(day.date)}
        </h3>
        {day.date_suspect && <Chip tone="a">Date mistyped in the file</Chip>}
        <span className="sub">
          {day.visits.length} movement{day.visits.length === 1 ? '' : 's'}
          {day.models.length ? ` · ${day.models.length} model${day.models.length === 1 ? '' : 's'}` : ''}
        </span>
        <span className="right" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {noBreakdown && <Chip tone="watch">{formatQty(day.unattributed)} with no model</Chip>}
          <span className="bignum">{formatQty(day.total)}</span>
        </span>
      </div>

      {open && (
        <>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Check</th>
                  <th>Serial</th>
                  <th className="num">Taken</th>
                </tr>
              </thead>
              <tbody>
                {day.models.map((m) => (
                  <tr key={m.model_id} data-testid="daily-model">
                    <td style={{ fontWeight: 600 }}>{m.name || 'Unknown model'}</td>
                    <td><Spec model={m} compact /></td>
                    <td><Serial model={m} compact /></td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatQty(m.qty)}</td>
                  </tr>
                ))}
                {noBreakdown && (
                  <tr data-testid="daily-no-breakdown">
                    <td colSpan={3}>
                      Recorded as a daily total, no models named <Chip tone="a">unresolved</Chip>
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatQty(day.unattributed)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total for the day</td>
                  <td className="num">{formatQty(day.total)}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>

          <div className="task-foot">
            <span className="msg">
              {day.visits.length === 1 ? 'The movement behind this day:' : 'The movements behind this day:'}
            </span>
            {day.visits.map((v) => (
              <Btn key={v.id} onClick={() => onOpenVisit(v.id)} testId="daily-open-visit">
                {visitRef(v)}
              </Btn>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
