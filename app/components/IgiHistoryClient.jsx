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
  const { base, readOnly } = useIgiPortal()
  const [visits, setVisits] = useState([])
  const [batches, setBatches] = useState([])
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
        sub={`${visits.length} movements and ${batches.length} production batches`}
      >
        <Switch
          testId="tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'visits', label: `Movements (${visits.length})` },
            { value: 'batches', label: `Batches (${batches.length})` },
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
                      {v.date_suspect && (
                        <div style={{ marginTop: 3 }}><Chip tone="a">Date mistyped</Chip></div>
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
                  <th>Date made</th>
                  <th>Your reference</th>
                  <th className="num">How many</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} data-testid="history-batch">
                    <td style={{ fontWeight: 600 }}>{b.name}</td>
                    <td className="mono">{b.serial}</td>
                    <td>{formatDate(b.batch_date)}</td>
                    <td className="mono">{b.reference || '—'}</td>
                    <td className="num">{formatQty(b.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableWrap>
      </Card>
    </>
  )
}
