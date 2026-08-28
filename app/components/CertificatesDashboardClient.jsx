'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatQty, formatEur, feeFor, SHELF_LABELS, POOL_LABELS } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import SerialSpec from './igi/SerialSpec'
import Chip, { SHELF_TONE, POOL_TONE } from './igi/Chip'
import { PageHead, Card, Kpis, Kpi, Loading, Note, Toast, Btn } from './certificates/ui'

/**
 * Where the certificates stand, both sides at once.
 *
 * LoveLab needs their own shelf and IGI's stock together, because the decision
 * is between walking across the road and ordering a month of production.
 */
export default function CertificatesDashboardClient() {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/overview')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the certificate stock')
      setData(body)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toCollect = useMemo(
    () => (data?.models || []).filter((m) => m.shelf_status === 'collect'),
    [data],
  )
  const toProduce = useMemo(
    () => (data?.models || []).filter((m) => m.pool_status === 'reorder'),
    [data],
  )

  if (loading) return <Loading />

  const t = data?.totals || {}

  return (
    <>
      <PageHead
        title="Dashboard"
        sub={data?.shelf?.last_read
          ? `Our shelf was last read on ${formatDate(data.shelf.last_read)}`
          : 'Our shelf has not been read yet'}
      />

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}

      {/* ── The two numbers the whole thing exists to answer ─────────────── */}
      <div className="split" style={{ marginBottom: 20 }}>
        <BigStat
          label="On our shelf"
          value={formatQty(t.on_shelf)}
          note="Received, waiting to be packed with an order."
          tone={t.to_collect ? 'now' : 'fine'}
          chip={t.to_collect ? `${t.to_collect} to collect` : 'Nothing to collect'}
          testId="stat-shelf"
        />
        <BigStat
          label="Still unissued at IGI"
          value={formatQty(t.at_igi)}
          note="Pre-printed or not yet produced. Emptying this is about a month of production."
          tone={t.to_produce ? 'now' : 'fine'}
          chip={t.to_produce ? `${t.to_produce} to produce` : 'Nothing to produce'}
          testId="stat-igi"
        />
      </div>

      <Kpis>
        <Kpi value={formatQty(t.models_in_use)} label="Models in use" testId="stat-models" />
        <Kpi value={formatQty(t.ordered)} label="Ordered in total" testId="stat-ordered" />
        <Kpi value={formatQty(t.open_visits)} label="Open movements" tone={t.open_visits ? 'a' : undefined} testId="stat-open" />
        <Kpi value={formatQty(t.reserved)} label="Reserved serials — numbered, never ordered" testId="stat-reserved" />
      </Kpis>

      {/* ── The gap. Visible, never absorbed. ────────────────────────────── */}
      {t.unattributed > 0 && (
        <Note warn testId="gap-card">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <span className="bignum" style={{ color: 'var(--signal)' }}>{formatQty(t.unattributed)}</span>
            <strong>certificates issued with no model attached</strong>
            <Chip tone="a">Unresolved</Chip>
          </div>
          Between 16 June and 28 July 2026 only daily totals were recorded, not the models.
          Those certificates are counted in the totals above but belong to no model, so every
          per-model figure on this page is short by some part of this number. It stays here
          until the movements are reconstructed, at which point the balances correct themselves.
        </Note>
      )}

      {data?.shelf?.unlinked > 0 && (
        <Note>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 260 }}>
              {data.shelf.unlinked} stock description{data.shelf.unlinked > 1 ? 's are' : ' is'} not
              linked to a model yet, so {data.shelf.unlinked > 1 ? 'those models have' : 'that model has'} no
              shelf figure.
            </span>
            <Btn onClick={() => router.push('/certificates/matching')} testId="go-matching">
              Open matching
            </Btn>
          </div>
        </Note>
      )}

      <div className="split">
        <ActionList
          title="Go collect"
          subtitle="Below our alert level. IGI already holds them — it is a walk across the road."
          models={toCollect}
          emptyText="Every model is above its alert level."
          render={(m) => ({ value: formatQty(m.shelf), tone: SHELF_TONE[m.shelf_status], label: SHELF_LABELS[m.shelf_status] })}
          testId="list-collect"
        />
        <ActionList
          title="Produce more"
          subtitle="Below IGI's own alert level. Ordering production takes about a month."
          models={toProduce}
          emptyText="IGI holds enough of every model, or has set no level yet."
          render={(m) => ({ value: formatQty(m.pool), tone: POOL_TONE[m.pool_status], label: POOL_LABELS[m.pool_status] })}
          testId="list-produce"
        />
      </div>

      <p style={{ marginTop: 4, fontSize: 12.5, color: 'var(--ink-faint)' }}>
        At €1,20 a certificate, the {formatQty(t.ordered)} ordered are worth{' '}
        {formatEur(feeFor(t.ordered || 0))} in certification over their life.
      </p>
    </>
  )
}

/** One of the two figures the module exists to answer. */
function BigStat({ label, value, note, tone, chip, testId }) {
  return (
    <div className="card" data-testid={testId}>
      <div className="card-head">
        <h3>{label}</h3>
        <span className="right"><Chip tone={tone}>{chip}</Chip></span>
      </div>
      <div className="card-body">
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 600,
          lineHeight: 1, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '.83rem', color: 'var(--ink-soft)' }}>{note}</p>
      </div>
    </div>
  )
}

/** The models needing something done to them, and what the something is. */
function ActionList({ title, subtitle, models, emptyText, render, testId }) {
  return (
    <div className="card" data-testid={testId}>
      <div className="card-head">
        <h3>{title}</h3>
        <span className="sub">{models.length}</span>
        <span className="right" style={{ fontSize: '.8rem', color: 'var(--ink-faint)' }}>{subtitle}</span>
      </div>
      {models.length === 0 ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <div className="tblwrap">
          <table style={{ minWidth: 0 }}>
            <tbody>
              {models.map((m) => {
                const r = render(m)
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{m.name}</div>
                      <SerialSpec model={m} compact />
                    </td>
                    <td className="num" style={{ fontWeight: 600, fontSize: '1.05rem' }}>{r.value}</td>
                    <td className="num"><Chip tone={r.tone}>{r.label}</Chip></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
