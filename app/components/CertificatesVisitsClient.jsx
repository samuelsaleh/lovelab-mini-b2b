'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatQty, visitRef, sameDayLabel } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import { VISIT_LABELS, VISIT_TONES } from '@/lib/igi/visits'
import Chip from './igi/Chip'
import CertificatesDailyClient from './CertificatesDailyClient'
import { PageHead, Card, Loading, Toast, Btn, TableWrap, Empty, Switch } from './certificates/ui'

const VIEWS = [
  { value: 'visit', label: 'By movement' },
  { value: 'day', label: 'By day' },
  { value: 'erp-in', label: 'LoveLab in' },
  { value: 'erp-out', label: 'LoveLab out' },
]

/**
 * Movements — IGI road crossings, plus LoveLab ERP Certificate In/Out
 * mirrored from the stock software every 10 minutes.
 */
export default function CertificatesVisitsClient({ initialView = 'visit' }) {
  const router = useRouter()
  const [view, setView] = useState(initialView)
  const [visits, setVisits] = useState([])
  const [erpIns, setErpIns] = useState(null)
  const [erpOuts, setErpOuts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erpLoading, setErpLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (view === 'erp-in' && erpIns == null && !erpLoading) loadErpIns()
    if (view === 'erp-out' && erpOuts == null && !erpLoading) loadErpOuts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

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

  async function loadErpIns() {
    setErpLoading(true)
    try {
      const res = await fetch('/api/igi/certificate-erp-ins')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load LoveLab ins')
      setErpIns(body.ins || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setErpLoading(false)
    }
  }

  async function loadErpOuts() {
    setErpLoading(true)
    try {
      const res = await fetch('/api/igi/certificate-erp-outs')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load LoveLab outs')
      setErpOuts(body.outs || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setErpLoading(false)
    }
  }

  if (loading) return <Loading />

  const open = visits.filter((v) => v.status !== 'closed')
  let sub = `${visits.length} movement${visits.length === 1 ? '' : 's'}${open.length ? `, ${open.length} still open` : ', all closed'}`
  if (view === 'erp-in') {
    sub = erpLoading || erpIns == null
      ? 'Loading LoveLab ins…'
      : `${erpIns.length} in line${erpIns.length === 1 ? '' : 's'} from the stock software`
  } else if (view === 'erp-out') {
    sub = erpLoading || erpOuts == null
      ? 'Loading LoveLab outs…'
      : `${erpOuts.length} out line${erpOuts.length === 1 ? '' : 's'} from the stock software`
  }

  return (
    <>
      <PageHead title="Movements" sub={sub}>
        <Switch options={VIEWS} value={view} onChange={setView} testId="view" />
        <Btn kind="primary" onClick={() => router.push('/certificates/stock')} testId="new-request">
          Ask IGI for more
        </Btn>
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}

      {view === 'day' ? (
        <CertificatesDailyClient embedded />
      ) : view === 'erp-in' ? (
        <ErpLedgerPanel
          kind="in"
          rows={erpIns || []}
          loading={erpLoading || erpIns == null}
          onReload={loadErpIns}
        />
      ) : view === 'erp-out' ? (
        <ErpLedgerPanel
          kind="out"
          rows={erpOuts || []}
          loading={erpLoading || erpOuts == null}
          onReload={loadErpOuts}
        />
      ) : (
        <>
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
                        {(v.date_suspect || v.correction) && (
                          <div style={{ marginTop: 3, display: 'flex', gap: 5 }}>
                            {v.correction && <Chip tone="a">Correction</Chip>}
                            {v.date_suspect && <Chip tone="a">Date mistyped in the file</Chip>}
                          </div>
                        )}
                      </td>
                      <td>
                        <Chip tone={VISIT_TONES[v.status]}>{VISIT_LABELS[v.status]}</Chip>
                        {(v.short_issue > 0 || v.short_return > 0) && (
                          <div style={{ marginTop: 3, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {v.short_issue > 0 && <Chip tone="watch" testId="short-issue">{formatQty(v.short_issue)} fewer than asked</Chip>}
                            {v.short_return > 0 && <Chip tone="now" testId="short-return">{formatQty(v.short_return)} missing on return</Chip>}
                          </div>
                        )}
                      </td>
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
            {visits.length === 0 && <Empty>No movements yet. Ask IGI for certificates from the Stock screen.</Empty>}
          </Card>

          <p style={{ fontSize: '.83rem', color: 'var(--ink-faint)', maxWidth: 720, lineHeight: 1.6 }}>
            A movement marked <em>no breakdown</em> is one IGI recorded as a daily total without the
            models, between 16 June and 28 July 2026. Its certificates are counted but belong to no
            model. Four movements also carry a mistyped year; the date is kept exactly as written and
            the reporting month is taken from the movement before it.
          </p>
        </>
      )}
    </>
  )
}

function ErpLedgerPanel({ kind, rows, loading, onReload }) {
  if (loading) return <Loading />

  const isIn = kind === 'in'
  const title = isIn ? 'LoveLab Certificate In' : 'LoveLab Certificate Out'
  const sub = isIn
    ? 'Copied from the stock software every 10 minutes (manual ins and IGI receives).'
    : 'Copied from the stock software every 10 minutes when LoveLab outs certificates.'
  const empty = isIn
    ? 'No LoveLab ins synced yet. Create a Certificate In in the stock software, or receive an IGI movement; it appears here within about 10 minutes.'
    : 'No LoveLab outs synced yet. Create a Certificate Out in the stock software; it appears here within about 10 minutes.'
  const note = isIn
    ? 'These rows are LoveLab Certificate In from the ERP. Rows with a visit:… reference came from an IGI receive push; others were entered in the stock software.'
    : 'These rows are LoveLab Certificate Out from the ERP. They do not change the IGI pool on Stock — that drops when IGI issues. They record certificates leaving LoveLab\'s own shelf.'
  const rowTestId = isIn ? 'erp-in-row' : 'erp-out-row'
  const tableTestId = isIn ? 'erp-ins-table' : 'erp-outs-table'
  const reloadTestId = isIn ? 'reload-erp-ins' : 'reload-erp-outs'

  return (
    <>
      <Card
        title={title}
        sub={sub}
        head={<Btn onClick={onReload} testId={reloadTestId}>Refresh</Btn>}
        flush
      >
        <TableWrap>
          <table style={{ minWidth: 820 }} data-testid={tableTestId}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Party</th>
                <th>Model</th>
                <th className="num">Pcs</th>
                {isIn && <th>Source</th>}
                <th>Synced</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const date = isIn ? row.in_date : row.out_date
                const key = row.id || (isIn ? row.erp_in_id : row.erp_out_id)
                const fromVisit = isIn && row.external_ref && /^visit:/i.test(String(row.external_ref))
                return (
                  <tr key={key} data-testid={rowTestId}>
                    <td>{date ? formatDate(date) : '—'}</td>
                    <td className="mono">{row.invoice_no ?? '—'}</td>
                    <td>{row.party || '—'}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                        {row.serial || '—'}
                      </div>
                      <div className="spec" style={{ marginTop: 2, maxWidth: 420 }}>
                        {row.description || '—'}
                      </div>
                    </td>
                    <td className="num">{formatQty(row.pcs)}</td>
                    {isIn && (
                      <td>
                        {fromVisit
                          ? <Chip tone="fine">IGI receive</Chip>
                          : <Chip tone="watch">ERP manual</Chip>}
                      </td>
                    )}
                    <td className="spec">
                      {row.synced_at ? formatDate(String(row.synced_at).slice(0, 10)) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
        {rows.length === 0 && <Empty>{empty}</Empty>}
      </Card>

      <p style={{ fontSize: '.83rem', color: 'var(--ink-faint)', maxWidth: 720, lineHeight: 1.6 }}>
        {note}
      </p>
    </>
  )
}
