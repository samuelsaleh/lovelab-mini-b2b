'use client'

import { useState, useEffect } from 'react'
import { formatQty, visitRef, sameDayLabel } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import { VISIT_LABELS, VISIT_TONES } from '@/lib/igi/visits'
import Chip from './igi/Chip'
import { useIgiPortal } from './certificates/IgiPortalContext'
import { PageHead, Card, Loading, Toast, Switch, TableWrap } from './certificates/ui'

/** What has already happened. Read only. */
export default function IgiHistoryClient() {
  const { base } = useIgiPortal()
  const [visits, setVisits] = useState([])
  const [batches, setBatches] = useState([])
  const [counts, setCounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('visits')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`${base}/history`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not load the history')
      setVisits(body.visits || [])
      setBatches(body.batches || [])
      setCounts(body.counts || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Loading />

  return (
    <>
      <PageHead
        title="History"
        sub={[
          `${visits.length} movements`,
          `${batches.length} production batches`,
          counts.length ? `${counts.length} count correction${counts.length === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(', ')}
      >
        <Switch
          testId="tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'visits', label: `Movements (${visits.length})` },
            { value: 'batches', label: `Production & counts (${batches.length + counts.length})` },
          ]}
        />
      </PageHead>

      {error && <Toast bad>{error}</Toast>}

      <Card flush>
        <TableWrap>
          {tab === 'visits' ? (
            <table style={{ minWidth: 560 }}>
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
                  <tr key={v.id} data-testid="history-visit">
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
                      {v.unattributed_total != null && (
                        <div className="spec">no models recorded</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Serial</th>
                  <th>Date</th>
                  <th>What</th>
                  <th className="num">How many</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...batches.map((b) => ({ kind: 'batch', when: b.batch_date, row: b })),
                  ...counts.map((c) => ({ kind: 'count', when: String(c.counted_at).slice(0, 10), row: c })),
                ]
                  .sort((a, b) => String(b.when).localeCompare(String(a.when)))
                  .map(({ kind, when, row }) => (kind === 'batch' ? (
                    <tr key={`b-${row.id}`} data-testid="history-batch">
                      <td style={{ fontWeight: 600 }}>{row.name}</td>
                      <td className="mono">{row.serial}</td>
                      <td>{formatDate(when)}</td>
                      <td className="mono">{row.reference || 'Made'}</td>
                      <td className="num">{formatQty(row.qty)}</td>
                    </tr>
                  ) : (
                    <tr key={`c-${row.id}`} data-testid="history-count">
                      <td style={{ fontWeight: 600 }}>{row.name}</td>
                      <td className="mono">{row.serial}</td>
                      <td>{formatDate(when)}</td>
                      <td>
                        <Chip tone="a">Count</Chip>
                        <span className="spec" style={{ marginLeft: 6 }}>{formatQty(row.was)} → {formatQty(row.counted)}</span>
                      </td>
                      <td className="num" style={{ color: row.delta < 0 ? 'var(--signal)' : 'var(--good)' }}>
                        {row.delta > 0 ? '+' : ''}{formatQty(row.delta)}
                      </td>
                    </tr>
                  )))}
              </tbody>
            </table>
          )}
        </TableWrap>
      </Card>
    </>
  )
}
