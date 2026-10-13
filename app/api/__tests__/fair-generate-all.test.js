/**
 * @jest-environment node
 *
 * POST /api/fair-assistant/generate-all — must never touch a draft that was
 * already sent (or is being sent). Before the fix it rewrote EVERY lead's draft
 * and set it back to draft_ready, so pressing Send a second time emailed
 * everyone again (found 12 Oct 2026).
 */
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))
jest.mock('@/lib/fair-assistant/translate', () => ({
  buildEmailForLead: jest.fn(({ lead }) => ({ subject: `Hi ${lead.first_name}`, bodyHtml: `<p>${lead.first_name}</p>`, language: 'en' })),
  translateSlotsForLanguages: jest.fn(async () => ({ en: { subject: 's', headline: 'h', paragraph1: 'p1', paragraph2: 'p2', signoff: 'x', ctaLine: 'c' } })),
}))

let tables
const adminSupabase = {
  from(name) {
    const st = { filters: [], op: 'select', patch: null, single: false }
    const q = {
      select() { return q }, order() { return q }, limit() { return q },
      eq(c, v) { st.filters.push((r) => r[c] === v); return q },
      neq(c, v) { st.filters.push((r) => r[c] !== v); return q },
      single() { st.single = true; return q },
      update(patch) { st.op = 'update'; st.patch = patch; return q },
      upsert(row, opts) {
        const key = opts?.onConflict || 'id'
        const existing = tables[name].find((r) => r[key] === row[key])
        if (existing) Object.assign(existing, row); else tables[name].push({ id: `d${tables[name].length + 1}`, ...row })
        return Promise.resolve({ error: null })
      },
      then(res, rej) {
        let rows = tables[name].filter((r) => st.filters.every((f) => f(r)))
        if (st.op === 'update') { rows.forEach((r) => Object.assign(r, st.patch)); return Promise.resolve({ error: null }).then(res, rej) }
        const out = rows.map((r) => ({ ...r }))
        return Promise.resolve(st.single ? { data: out[0] || null, error: out[0] ? null : { message: 'nf' } } : { data: out, error: null }).then(res, rej)
      },
    }
    return q
  },
}
jest.mock('@/lib/fair-assistant/server', () => ({
  requireFairAdmin: jest.fn(async () => ({ adminSupabase })),
  siteUrl: () => 'https://app.lovelab-antwerp.com',
}))
const { POST } = require('../fair-assistant/generate-all/route')
const call = () => POST(new global.Request('http://localhost/api/fair-assistant/generate-all', { method: 'POST', body: JSON.stringify({ batchId: 'b1' }), headers: { 'Content-Type': 'application/json' } }))

beforeEach(() => {
  tables = {
    fair_batches: [{ id: 'b1', name: 'Paris', fair_name: 'Paris', status: 'drafting', subject: 's', headline: 'h', paragraph1: 'p1', paragraph2: 'p2', signoff: 'x' }],
    fair_leads: ['A', 'B', 'C'].map((n, i) => ({ id: `l${i}`, batch_id: 'b1', first_name: n, last_name: 'X', email: `${n}@x.com`, status: 'extracted', lead_type: 'shop', language: 'en' })),
    fair_email_drafts: [],
  }
})

describe('generate-all', () => {
  test('writes a draft for every lead the first time', async () => {
    const body = await (await call()).json()
    expect(body).toMatchObject({ ok: true, generated: 3, failed: 0, total: 3 })
    expect(tables.fair_email_drafts.map((d) => d.status)).toEqual(['draft_ready', 'draft_ready', 'draft_ready'])
  })

  test('never resets a sent draft to draft_ready (so a second Send cannot email anyone twice)', async () => {
    tables.fair_email_drafts = [
      { id: 'd1', batch_id: 'b1', lead_id: 'l0', status: 'sent', subject: 'old', body_html: '<p>old</p>', sent_at: '2026-10-12T08:00:00Z', message_id: 're_1' },
      { id: 'd2', batch_id: 'b1', lead_id: 'l1', status: 'sending', subject: 'old', body_html: '<p>old</p>' },
    ]
    const body = await (await call()).json()
    const byLead = Object.fromEntries(tables.fair_email_drafts.map((d) => [d.lead_id, d]))
    expect(byLead.l0).toMatchObject({ status: 'sent', subject: 'old', message_id: 're_1' })      // untouched
    expect(byLead.l1).toMatchObject({ status: 'sending', subject: 'old' })                       // untouched
    expect(byLead.l2).toMatchObject({ status: 'draft_ready' })                                   // the only new one
    expect(body).toMatchObject({ generated: 1, skippedSent: 2 })
  })

  test('still rewrites drafts that are ready or failed (editing the text and regenerating works)', async () => {
    tables.fair_email_drafts = [
      { id: 'd1', batch_id: 'b1', lead_id: 'l0', status: 'draft_ready', subject: 'old', body_html: '<p>old</p>' },
      { id: 'd2', batch_id: 'b1', lead_id: 'l1', status: 'failed', subject: null, body_html: null, error: 'Resend rate limit' },
    ]
    const body = await (await call()).json()
    expect(tables.fair_email_drafts.filter((d) => d.status === 'draft_ready')).toHaveLength(3)
    expect(tables.fair_email_drafts.find((d) => d.lead_id === 'l0').subject).toBe('Hi A')
    expect(body).toMatchObject({ generated: 3, skippedSent: 0 })
  })
})
