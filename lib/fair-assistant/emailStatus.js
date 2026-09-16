/**
 * One pill per lead answering "did the email reach them?" — shared by the
 * Leads tab and the batch follow-up (Sam, 15 Sep 2026).
 *
 * What Resend said after the send (webhook or check) outranks our own send
 * status: "sent" only means it left us. A bounce outranks an open; an open
 * or a click outranks plain "delivered". Returns null when nothing has been
 * written for the lead yet. `key` is the machine name for filters and
 * translations; `label` is the English pill text.
 */
export function emailStatusFor(draft) {
  if (!draft) return null
  const delivery = draft.delivery_status || null
  const deliveryBad = delivery === 'bounced' || delivery === 'complained' || delivery === 'failed' || delivery === 'suppressed'
  if (deliveryBad) {
    return { key: delivery === 'complained' ? 'complained' : 'bounced', bg: '#fee2e2', fg: '#991b1b', label: delivery === 'complained' ? '✗ marked as spam' : '✗ bounced', detail: draft.delivery_error || null, bad: true }
  }
  if (draft.clicked_at) return { key: 'clicked', bg: '#dcfce7', fg: '#166534', label: '✓ clicked', detail: null, bad: false }
  if (draft.opened_at) return { key: 'opened', bg: '#dcfce7', fg: '#166534', label: '✓ opened', detail: null, bad: false }
  if (delivery === 'delivered') return { key: 'delivered', bg: '#dcfce7', fg: '#166534', label: '✓ delivered', detail: null, bad: false }
  if (delivery === 'delivery_delayed') return { key: 'delayed', bg: '#fef3c7', fg: '#92400e', label: '⏳ delivery delayed', detail: draft.delivery_error || null, bad: false }
  if (draft.status === 'sent') return { key: 'sent', bg: '#dcfce7', fg: '#166534', label: '✓ sent, awaiting delivery', detail: null, bad: false }
  if (draft.status === 'failed') return { key: 'failed', bg: '#fee2e2', fg: '#991b1b', label: '✗ not sent', detail: draft.error || null, bad: true }
  if (draft.status === 'draft_ready') return { key: 'draft_ready', bg: '#f3e8ff', fg: '#6b21a8', label: '○ draft ready', detail: null, bad: false }
  return null
}

const BAD_KEYS = new Set(['bounced', 'complained', 'failed'])

/** Everything the follow-up screen shows, computed from one batch payload. */
export function summarizeBatch({ batch, images = [], leads = [], drafts = [] }) {
  const byLead = new Map()
  for (const d of drafts) if (d?.lead_id) byLead.set(d.lead_id, d)

  const rows = leads.map((lead) => {
    const draft = byLead.get(lead.id) || null
    const pill = emailStatusFor(draft)
    return {
      lead,
      draft,
      pill,
      language: lead.language_label || lead.language || null,
      segment: lead.lead_type || 'shop',
      sent: draft?.status === 'sent',
      opened: Boolean(draft?.opened_at || draft?.clicked_at),
      bad: Boolean(pill?.bad),
    }
  })

  const group = (keyOf) => {
    const m = new Map()
    for (const r of rows) {
      const k = keyOf(r)
      if (!m.has(k)) m.set(k, { key: k, leads: 0, sent: 0, opened: 0 })
      const g = m.get(k)
      g.leads += 1
      if (r.sent) g.sent += 1
      if (r.opened) g.opened += 1
    }
    return [...m.values()].sort((a, b) => b.leads - a.leads)
  }

  const sentAts = drafts.map((d) => d.sent_at).filter(Boolean).map((s) => new Date(s).getTime())
  const startedAt = batch?.created_at ? new Date(batch.created_at).getTime() : null
  const durationMs = startedAt && sentAts.length ? Math.max(0, Math.max(...sentAts) - startedAt) : null

  return {
    cards: images.filter((i) => i.status === 'processed').length,
    cardsTotal: images.length,
    leads: rows.length,
    sent: rows.filter((r) => r.sent).length,
    delivered: rows.filter((r) => r.opened || r.draft?.delivery_status === 'delivered').length,
    opened: rows.filter((r) => r.opened).length,
    bad: rows.filter((r) => r.bad).length,
    hasDeliveryData: drafts.some((d) => d.delivery_status || d.opened_at || d.clicked_at),
    durationMs,
    byLanguage: group((r) => r.language || 'unknown'),
    bySegment: group((r) => r.segment),
    rows,
  }
}

/** "7 min", "1 h 20", "2 d 3 h" — or null when unknown. */
export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return null
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h < 24) return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
  const d = Math.floor(h / 24)
  const hh = h % 24
  return hh ? `${d} d ${hh} h` : `${d} d`
}

export { BAD_KEYS }
