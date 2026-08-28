'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts, card, btn } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, formatEur, feeFor, SHELF_LABELS, POOL_LABELS } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import SerialSpec from './igi/SerialSpec'
import Chip, { SHELF_TONE, POOL_TONE } from './igi/Chip'

/**
 * Where the certificates stand, both sides at once.
 *
 * LoveLab needs their own shelf and IGI's stock together, because the decision
 * is between walking across the road and ordering a month of production.
 */
export default function CertificatesDashboardClient() {
  const router = useRouter()
  const { isCompact } = useResponsive()
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

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading...
      </div>
    )
  }

  const t = data?.totals || {}

  return (
    <div style={{ padding: isCompact ? 16 : 28, fontFamily: fonts.body, maxWidth: 1180 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: fonts.heading, fontSize: isCompact ? 24 : 30, margin: 0, color: colors.text }}>
          Certificates
        </h1>
        <p style={{ margin: '4px 0 0', color: colors.textLight, fontSize: 13 }}>
          One shared stock, held by LoveLab and IGI together.
          {data?.shelf?.last_read
            ? ` Our shelf was last read on ${formatDate(data.shelf.last_read)}.`
            : ' Our shelf has not been read yet.'}
        </p>
      </div>

      {error && (
        <div style={{ ...banner, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={dismiss} data-testid="dismiss-error">Dismiss</button>
        </div>
      )}

      {/* ── The two numbers the whole thing exists to answer ─────────────── */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: isCompact ? '1fr' : 'repeat(2, 1fr)', marginBottom: 12 }}>
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

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: isCompact ? '1fr 1fr' : 'repeat(4, 1fr)', marginBottom: 20 }}>
        <SmallStat label="Models in use" value={formatQty(t.models_in_use)} testId="stat-models" />
        <SmallStat label="Ordered in total" value={formatQty(t.ordered)} testId="stat-ordered" />
        <SmallStat label="Open movements" value={formatQty(t.open_visits)} testId="stat-open" />
        <SmallStat
          label="Reserved serials"
          value={formatQty(t.reserved)}
          note="Numbered, never ordered"
          testId="stat-reserved"
        />
      </div>

      {/* ── The gap. Visible, never absorbed. ────────────────────────────── */}
      {t.unattributed > 0 && (
        <div style={{ ...card, padding: 16, marginBottom: 20, borderLeft: `3px solid #6d28d9` }} data-testid="gap-card">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#6d28d9' }}>
              {formatQty(t.unattributed)}
            </span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>certificates issued with no model attached</span>
            <Chip tone="gap">Unresolved</Chip>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.textLight, lineHeight: 1.55, maxWidth: 720 }}>
            Between 16 June and 28 July 2026 only daily totals were recorded, not the models.
            Those certificates are counted in the totals above but belong to no model, so every
            per-model figure on this page is short by some part of this number. It stays here
            until the movements are reconstructed, at which point the balances correct themselves.
          </p>
        </div>
      )}

      {data?.shelf?.unlinked > 0 && (
        <div style={{ ...banner, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309' }}>
          <span>
            {data.shelf.unlinked} stock description{data.shelf.unlinked > 1 ? 's are' : ' is'} not
            linked to a model yet, so {data.shelf.unlinked > 1 ? 'those models have' : 'that model has'} no
            shelf figure.
          </span>
          <button
            onClick={() => router.push('/admin/certificates/matching')}
            style={{ ...btn.secondary, padding: '6px 14px', fontSize: 12 }}
            data-testid="go-matching"
          >
            Open matching
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr' }}>
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

      <p style={{ marginTop: 20, fontSize: 12, color: colors.textMuted }}>
        At €1,20 a certificate, the {formatQty(t.ordered)} ordered are worth{' '}
        {formatEur(feeFor(t.ordered || 0))} in certification over their life.
      </p>
    </div>
  )
}

function BigStat({ label, value, note, tone, chip, testId }) {
  return (
    <div style={{ ...card, padding: 18 }} data-testid={testId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={statLabel}>{label}</span>
        <Chip tone={tone}>{chip}</Chip>
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, color: colors.inkPlum, marginTop: 6, lineHeight: 1.1 }}>
        {value}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.textLight }}>{note}</p>
    </div>
  )
}

function SmallStat({ label, value, note, testId }) {
  return (
    <div style={{ ...card, padding: 14 }} data-testid={testId}>
      <span style={statLabel}>{label}</span>
      <div style={{ fontSize: 22, fontWeight: 700, color: colors.text, marginTop: 4 }}>{value}</div>
      {note && <p style={{ margin: '2px 0 0', fontSize: 11, color: colors.textMuted }}>{note}</p>}
    </div>
  )
}

function ActionList({ title, subtitle, models, emptyText, render, testId }) {
  return (
    <div style={{ ...card, padding: 16 }} data-testid={testId}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: colors.text }}>
        {title}{' '}
        <span style={{ color: colors.textMuted, fontWeight: 500 }}>({models.length})</span>
      </h2>
      <p style={{ margin: '2px 0 12px', fontSize: 12, color: colors.textLight }}>{subtitle}</p>

      {models.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>{emptyText}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {models.map((m) => {
            const r = render(m)
            return (
              <div key={m.id} style={row}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 2 }}>
                    {m.name}
                  </div>
                  <SerialSpec model={m} compact />
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>{r.value}</div>
                  <Chip tone={r.tone}>{r.label}</Chip>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const statLabel = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: colors.textMuted,
  fontWeight: 700,
}

const row = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '8px 10px',
  borderRadius: 8,
  background: colors.bgOff,
}

const banner = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  padding: '10px 14px',
  borderRadius: 10,
  fontSize: 13,
  marginBottom: 16,
}

const dismiss = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'inherit',
}
