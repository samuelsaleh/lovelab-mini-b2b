'use client'

/**
 * Fair follow-up — what one outreach batch produced (Sam, 15 Sep 2026).
 *
 * The screen Sam sketched as "Suivi du salon": big figures for cards, leads,
 * emails, delivered, opened, bounced and how long the batch took; leads per
 * language and per segment; and every lead with the answer Resend gave for
 * their email. All computed from the batch payload the Fair Assistant has
 * already loaded — no extra request, except "Check deliveries now", which
 * asks Resend and reloads.
 */

import { useMemo, useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'
import { summarizeBatch, formatDuration } from '@/lib/fair-assistant/emailStatus'

const PLUM = '#4a2545'
const PLUM_SOFT = '#8b5e92'
const PLUM_LIGHT = '#c9a5cc'
const INK = '#2b2230'

function Tile({ id, value, label, hint }) {
  return (
    <div data-testid={`fair-tile-${id}`} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderTop: `3px solid ${PLUM}`, borderRadius: 4, padding: '18px 16px 14px', minWidth: 0 }}>
      <div style={{ fontFamily: fonts.heading, fontSize: 30, fontWeight: 700, color: INK, lineHeight: 1.05 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6f6474' }}>{label}</div>
      {hint && <div style={{ marginTop: 4, fontSize: 11, color: '#9a8f9e' }}>{hint}</div>}
    </div>
  )
}

function Bars({ id, title, groups, labelFor, legend }) {
  const max = Math.max(1, ...groups.map((g) => g.leads))
  return (
    <div data-testid={`fair-bars-${id}`} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 4, padding: '16px 18px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6f6474', marginBottom: 12 }}>{title}</div>
      {groups.length === 0 ? (
        <div style={{ fontSize: 13, color: colors.lovelabMuted }}>—</div>
      ) : groups.map((g, i) => {
        const tone = [PLUM, PLUM_SOFT, PLUM_LIGHT, '#ddc8df'][Math.min(i, 3)]
        const width = Math.round((g.leads / max) * 100)
        const openedWidth = g.leads ? Math.round((g.opened / g.leads) * width) : 0
        return (
          <div key={g.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 130px) 1fr 40px', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelFor(g.key)}</span>
            <span style={{ position: 'relative', height: 14, background: '#f3ecf4', borderRadius: 2, overflow: 'hidden' }} aria-hidden="true">
              <span style={{ position: 'absolute', inset: 0, width: `${width}%`, background: tone, opacity: 0.45 }} />
              <span style={{ position: 'absolute', inset: 0, width: `${openedWidth}%`, background: tone }} />
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: INK, textAlign: 'right' }}>{g.leads}</span>
          </div>
        )
      })}
      {legend && <div style={{ marginTop: 6, fontSize: 11, color: '#9a8f9e' }}>{legend}</div>}
    </div>
  )
}

function fmtDate(iso, lang) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-BE' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '—' }
}

export default function FairBatchFollowUp({ batch, images, leads, drafts, onRefreshDeliveries, isMobile = false }) {
  const { t, lang } = useI18n()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState(null)

  const summary = useMemo(() => summarizeBatch({ batch, images, leads, drafts }), [batch, images, leads, drafts])

  const segmentLabel = (key) => t(`fair.followup.segment.${['shop', 'agent', 'partner'].includes(key) ? key : 'other'}`)
  const languageLabel = (key) => (key === 'unknown' ? '—' : key)

  const pillLabel = (pill) => {
    if (!pill) return t('fair.followup.status.none')
    if (pill.key === 'opened') return t('fair.followup.status.opened')
    if (pill.key === 'clicked') return t('fair.followup.status.clicked')
    return pill.label
  }

  const q = search.trim().toLowerCase()
  const visible = summary.rows.filter((r) => {
    if (filter === 'opened' && !r.opened) return false
    if (filter === 'notOpened' && (r.opened || !r.sent)) return false
    if (filter === 'bad' && !r.bad) return false
    if (!q) return true
    const hay = `${r.lead.first_name || ''} ${r.lead.last_name || ''} ${r.lead.company || ''} ${r.lead.email || ''}`.toLowerCase()
    return hay.includes(q)
  })

  const runCheck = async () => {
    if (!onRefreshDeliveries || checking) return
    setChecking(true)
    setCheckResult(null)
    try {
      const res = await onRefreshDeliveries()
      if (res) setCheckResult(t('fair.followup.checked', { checked: res.checked ?? 0, updated: res.updated ?? 0 }))
    } catch (err) {
      setCheckResult(err?.message || 'Check failed')
    } finally {
      setChecking(false)
    }
  }

  const duration = formatDuration(summary.durationMs)
  const nothingYet = summary.sent === 0 && summary.leads === 0

  return (
    <div data-testid="fair-followup" style={{ fontFamily: fonts.body, color: INK }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: fonts.heading, fontSize: 24, fontWeight: 700, color: INK }}>{t('fair.followup.title')}</h2>
          <div style={{ marginTop: 2, fontSize: 13, color: '#6f6474' }}>{t('fair.followup.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {batch?.fair_name && (
            <span style={{ padding: '8px 14px', border: `1px solid ${colors.border}`, borderRadius: 4, background: '#fff', fontSize: 14, fontWeight: 600 }}>
              {batch.fair_name} <span style={{ color: '#9a8f9e', fontWeight: 400 }}>· {batch.status}</span>
            </span>
          )}
          <button
            type="button"
            onClick={runCheck}
            disabled={checking || summary.sent === 0}
            data-testid="fair-followup-check"
            style={{ padding: '9px 14px', borderRadius: 4, border: `1px solid ${PLUM}`, background: checking || summary.sent === 0 ? '#f3ecf4' : PLUM, color: checking || summary.sent === 0 ? PLUM : '#fff', fontWeight: 700, fontSize: 13, cursor: checking || summary.sent === 0 ? 'default' : 'pointer', fontFamily: fonts.body }}
          >
            {checking ? t('fair.followup.checking') : t('fair.followup.check')}
          </button>
        </div>
      </div>

      {checkResult && <div role="status" style={{ marginBottom: 12, fontSize: 13, color: '#166534' }}>{checkResult}</div>}

      {nothingYet ? (
        <div style={{ padding: 32, textAlign: 'center', color: colors.lovelabMuted, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 4 }}>{t('fair.followup.nothingYet')}</div>
      ) : (
        <>
          {!summary.hasDeliveryData && summary.sent > 0 && (
            <div role="note" style={{ marginBottom: 14, padding: '10px 14px', background: '#fff8e6', border: '1px solid #f1d58a', borderRadius: 4, fontSize: 13, color: '#7a5a00' }}>
              {t('fair.followup.noDelivery')}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
            <Tile id="cards" value={summary.cards} label={t('fair.followup.cards')} hint={summary.cardsTotal > summary.cards ? `${summary.cards} / ${summary.cardsTotal}` : null} />
            <Tile id="leads" value={summary.leads} label={t('fair.followup.leads')} />
            <Tile id="sent" value={summary.sent} label={t('fair.followup.sent')} />
            <Tile id="duration" value={duration || '—'} label={t('fair.followup.duration')} hint={t('fair.followup.durationHint')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
            <Tile id="delivered" value={summary.delivered} label={t('fair.followup.delivered')} />
            <Tile id="opened" value={summary.opened} label={t('fair.followup.opened')} hint={summary.sent ? `${Math.round((summary.opened / summary.sent) * 100)} %` : null} />
            <Tile id="bad" value={summary.bad} label={t('fair.followup.bounced')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
            <Bars id="language" title={t('fair.followup.byLanguage')} groups={summary.byLanguage} labelFor={languageLabel} legend={t('fair.followup.legend')} />
            <Bars id="segment" title={t('fair.followup.bySegment')} groups={summary.bySegment} labelFor={segmentLabel} legend={t('fair.followup.legend')} />
          </div>

          <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px', borderBottom: `1px solid ${colors.border}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6f6474', marginRight: 6 }}>{t('fair.followup.leadsTitle')}</span>
              {[['all', 'fair.followup.filter.all'], ['opened', 'fair.followup.filter.opened'], ['notOpened', 'fair.followup.filter.notOpened'], ['bad', 'fair.followup.filter.bad']].map(([id, key]) => (
                <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
                  style={{ padding: '5px 11px', borderRadius: 14, border: `1px solid ${filter === id ? PLUM : colors.border}`, background: filter === id ? PLUM : '#fff', color: filter === id ? '#fff' : INK, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}>
                  {t(key)}
                </button>
              ))}
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('fair.followup.search')} aria-label={t('fair.followup.search')}
                style={{ marginLeft: 'auto', flex: '1 1 200px', maxWidth: 280, padding: '7px 10px', border: `1px solid ${colors.border}`, borderRadius: 4, fontSize: 13, fontFamily: fonts.body }} />
            </div>
            {visible.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>{t('fair.followup.empty')}</div>
            ) : isMobile ? (
              <div>
                {visible.map((r) => (
                  <div key={r.lead.id} data-testid="fair-followup-row" style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, background: r.bad ? '#fef2f2' : '#fff' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{[r.lead.first_name, r.lead.last_name].filter(Boolean).join(' ') || r.lead.email || '—'}</div>
                    <div style={{ fontSize: 12, color: '#6f6474' }}>{r.lead.company || ''}{r.language ? ` · ${r.language}` : ''} · {segmentLabel(r.segment)}</div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: r.pill?.bg || '#f3f4f6', color: r.pill?.fg || '#6b7280' }}>{pillLabel(r.pill)}</span>
                      {r.opened && <span style={{ fontSize: 11, color: '#6f6474' }}>{fmtDate(r.draft.opened_at || r.draft.clicked_at, lang)}</span>}
                    </div>
                    {r.pill?.detail && <div style={{ marginTop: 4, fontSize: 11, color: '#991b1b' }}>{r.pill.detail}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6f6474' }}>
                    <th style={{ padding: '10px 16px', fontWeight: 700 }}>{t('fair.followup.col.lead')}</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>{t('fair.followup.col.language')}</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>{t('fair.followup.col.segment')}</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>{t('fair.followup.col.status')}</th>
                    <th style={{ padding: '10px 16px', fontWeight: 700 }}>{t('fair.followup.col.opened')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.lead.id} data-testid="fair-followup-row" style={{ borderTop: `1px solid ${colors.border}`, background: r.bad ? '#fef2f2' : '#fff' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ fontWeight: 700 }}>{[r.lead.first_name, r.lead.last_name].filter(Boolean).join(' ') || r.lead.email || '—'}</div>
                        <div style={{ fontSize: 12, color: '#6f6474' }}>{r.lead.company || r.lead.email || ''}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{r.language || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{segmentLabel(r.segment)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: r.pill?.bg || '#f3f4f6', color: r.pill?.fg || '#6b7280', whiteSpace: 'nowrap' }}>{pillLabel(r.pill)}</span>
                        {r.pill?.detail && <div style={{ marginTop: 4, fontSize: 11, color: '#991b1b', maxWidth: 360 }}>{r.pill.detail}</div>}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#6f6474', whiteSpace: 'nowrap' }}>{r.opened ? fmtDate(r.draft.opened_at || r.draft.clicked_at, lang) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
