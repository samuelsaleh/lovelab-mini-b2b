'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatQty, visitRef, sameDayLabel } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import { VISIT_LABELS, VISIT_TONES } from '@/lib/igi/visits'
import Chip from './igi/Chip'
import { PageHead, Card, Loading, Toast, Btn, TableWrap, Empty } from './certificates/ui'

/** Every movement, newest first. */
export default function CertificatesVisitsClient() {
  const router = useRouter()
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/visits')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the movements')
      setVisits(body.visits || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Loading />

  const open = visits.filter((v) => v.status !== 'closed')

  return (
    <>
      <PageHead
        title="Visits"
        sub={`${visits.length} movement${visits.length === 1 ? '' : 's'}${open.length ? `, ${open.length} still open` : ', all closed'}`}
      >
        <Btn kind="primary" onClick={() => router.push('/certificates/requests')} testId="new-request">
          New request
        </Btn>
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}

      <Card flush>
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Movement</th>
                <th>Date</th>
                <th>Where it is</th>
                <th className="num">Models</th>
                <th className="num">Certificates</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr
                  key={v.id}
                  className="clickable"
                  onClick={() => router.push(`/certificates/visits/${v.id}`)}
                  data-testid="visit-row"
                >
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
                    {v.date_suspect && (
                      <div style={{ marginTop: 3 }}>
                        <Chip tone="a">Date mistyped in the file</Chip>
                      </div>
                    )}
                  </td>
                  <td><Chip tone={VISIT_TONES[v.status]}>{VISIT_LABELS[v.status]}</Chip></td>
                  <td className="num">
                    {v.unattributed_total != null
                      ? <span className="spec">no breakdown</span>
                      : formatQty(v.line_count)}
                  </td>
                  <td className="num">{formatQty(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {visits.length === 0 && <Empty>No movements yet. Start with a new request.</Empty>}
      </Card>

      <p style={{ fontSize: '.83rem', color: 'var(--ink-faint)', maxWidth: 720, lineHeight: 1.6 }}>
        A movement marked <em>no breakdown</em> is one IGI recorded as a daily total without the
        models, between 16 June and 28 July 2026. Its certificates are counted but belong to no
        model. Four movements also carry a mistyped year; the date is kept exactly as written and
        the reporting month is taken from the movement before it.
      </p>
    </>
  )
}
