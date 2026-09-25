import { fetchAll, fetchSupabaseRows, isReportableSale, netOrderAmount, normaliseSupabaseRows, orderDay, parseTypedDay } from '../dataSources/supabase.js'

const doc = (over = {}) => ({
  id: 'd1',
  document_type: 'order',
  status: 'sent',
  order_channel: 'b2b',
  total_amount: 121,
  created_at: '2026-08-10T09:00:00+00:00',
  deleted_at: null,
  event_id: null,
  agent_id: null,
  metadata: { formState: { date: '10 Aug 2026', taxPercent: 21 } },
  ...over,
})

describe('isReportableSale — the app’s own rule', () => {
  it('keeps a sent order', () => expect(isReportableSale(doc())).toBe(true))
  it.each([
    ['draft', { status: 'draft' }],
    ['deleted', { deleted_at: '2026-08-11T00:00:00Z' }],
    ['quote', { document_type: 'quote' }],
    ['internal', { order_channel: 'internal' }],
    ['consignment', { order_channel: 'consignment' }],
    ['delete_from_stock', { order_channel: 'delete_from_stock' }],
    ['sample', { order_channel: 'sample' }],
  ])('drops a %s', (_, over) => expect(isReportableSale(doc(over))).toBe(false))
})

describe('netOrderAmount — same base as the commission ledger', () => {
  it('backs out VAT', () => expect(netOrderAmount(doc())).toBe(100))
  it('also removes shipping', () => expect(netOrderAmount(doc({ total_amount: 133.1, metadata: { shipping_amount: 10, formState: { taxPercent: 21 } } }))).toBe(100))
  it('prefers metadata.tax_percent over the form value', () => expect(netOrderAmount(doc({ total_amount: 110, metadata: { tax_percent: 10, formState: { taxPercent: 21 } } }))).toBe(100))
  it('treats a missing or silly tax rate as no VAT', () => {
    expect(netOrderAmount(doc({ total_amount: 100, metadata: {} }))).toBe(100)
    expect(netOrderAmount(doc({ total_amount: 100, metadata: { formState: { taxPercent: 150 } } }))).toBe(100)
  })
  it('never goes negative', () => expect(netOrderAmount(doc({ total_amount: 5, metadata: { shipping_amount: 20 } }))).toBe(0))
})

describe('orderDay — typed date first, then created_at in Brussels time', () => {
  it('reads the typed date as a calendar day', () => expect(orderDay(doc({ metadata: { formState: { date: '24 Sept 2026' } } }))).toBe('2026-09-24'))
  it('keeps an ISO typed date as-is', () => expect(orderDay(doc({ metadata: { formState: { date: '2026-08-31' } } }))).toBe('2026-08-31'))
  it('falls back to created_at, in Brussels', () =>
    // 23:30 UTC on 31 July is already 1 August in Antwerp.
    expect(orderDay(doc({ metadata: {}, created_at: '2026-07-31T23:30:00+00:00' }))).toBe('2026-08-01'))
})

describe('normaliseSupabaseRows', () => {
  const rows = {
    documents: [
      doc({ id: 'o1', agent_id: 'a1', event_id: 'e1', client_company: '  Bijouterie Dupont ' }),
      doc({ id: 'o2', order_channel: 'b2c', total_amount: 50, metadata: { formState: { date: '2026-08-12' } } }),
      doc({ id: 'o3', status: 'draft', agent_id: 'a1' }),
    ],
    events: [{ id: 'e1', name: 'Bijorhca', type: 'fair', start_date: '2026-08-06', end_date: '2026-08-08' }, { id: 'e2', name: 'Nicolas', type: 'agent' }],
    profiles: [{ id: 'a1', full_name: 'Nicolas Wholesale', email: 'n@example.com' }],
    commissions: [
      { id: 'c1', agent_id: 'a1', document_id: 'o1', type: 'order', commission_amount: 10, status: 'approved', created_at: '2026-09-02T10:00:00Z' },
      { id: 'c2', agent_id: 'a1', document_id: 'o3', type: 'order', commission_amount: 99, status: 'pending', created_at: '2026-08-10T10:00:00Z' },
      { id: 'c3', agent_id: 'a1', document_id: 'o1', type: 'order', commission_amount: 77, status: 'cancelled', created_at: '2026-08-10T10:00:00Z' },
      { id: 'c4', agent_id: 'a1', document_id: null, type: 'bonus', commission_amount: 25, status: 'approved', created_at: '2026-08-20T10:00:00Z' },
    ],
    payments: [{ id: 'p1', agent_id: 'a1', amount: '40.5', payment_date: '2026-08-15' }],
  }
  const m = normaliseSupabaseRows(rows, { asOf: '2026-09-24' })

  it('keeps only real sales, with net amounts and B2B/B2C', () => {
    expect(m.orders).toEqual([
      { id: 'o1', date: '2026-08-10', dateSource: 'typed', channel: 'B2B', amount: 100, eventId: 'e1', agentId: 'a1', clientKey: 'bijouterie dupont', rawChannel: 'b2b', lineTotal: 0 },
      { id: 'o2', date: '2026-08-12', dateSource: 'typed', channel: 'B2C', amount: 50, eventId: null, agentId: null, clientKey: null, rawChannel: 'b2c', lineTotal: 0 }, // no tax rate on the order → nothing backed out
    ])
  })

  it('dates earned commission by its sale, drops cancelled and non-sale commissions, keeps bonuses', () => {
    expect(m.commissions).toEqual([
      { id: 'c1', agentId: 'a1', orderId: 'o1', date: '2026-08-10', amount: 10 },
      { id: 'c4', agentId: 'a1', orderId: null, date: '2026-08-20', amount: 25 },
    ])
  })

  it('marks fairs from events.type and names agents from profiles', () => {
    expect(m.events.map((e) => e.kind)).toEqual(['fair', 'other'])
    expect(m.agents).toEqual([{ id: 'a1', name: 'Nicolas Wholesale' }])
    expect(m.payments).toEqual([{ id: 'p1', agentId: 'a1', date: '2026-08-15', amount: 40.5 }])
    expect(m).toMatchObject({ source: 'supabase', amountBasis: 'net_ex_vat', dataThrough: '2026-09-24' })
  })
})

describe('parseTypedDay — the free-text date field, read the Belgian way', () => {
  it.each([
    ['24 Sept 2026', '2026-09-24'],
    ['24 Sep 2026', '2026-09-24'],
    ['2026-08-31', '2026-08-31'],
    ['05/09/2026', '2026-09-05'], // 5 September — never 9 May
    ['12/08/2026', '2026-08-12'],
    ['24.09.2026', '2026-09-24'],
    ['24 mai 2026', '2026-05-24'],
    ['1er juin 2026', '2026-06-01'],
    ['3 okt. 2026', '2026-10-03'],
    ['24 set 2026', '2026-09-24'],
    ['Sep 24, 2026', '2026-09-24'],
  ])('%s → %s', (raw, day) => expect(parseTypedDay(raw)).toBe(day))

  it.each(['31/02/2026', 'next week', '', '2026-13-01'])('refuses %p instead of guessing', (raw) => expect(parseTypedDay(raw)).toBeNull())

  it('marks an unreadable typed date so the checks can warn, and falls back to the entry day', () => {
    const m = normaliseSupabaseRows({ documents: [doc({ id: 'x', metadata: { formState: { date: 'next week' } }, created_at: '2026-08-03T09:00:00Z' })] })
    expect(m.orders[0]).toMatchObject({ date: '2026-08-03', dateSource: 'typed_unreadable' })
  })
})

describe('payments are dated in Brussels time', () => {
  it('a payment at 23:30 UTC on 31 August is a 1 September payment', () => {
    const m = normaliseSupabaseRows({ payments: [{ id: 'p', agent_id: 'a', amount: 10, payment_date: '2026-08-31T23:30:00+00:00' }] })
    expect(m.payments[0].date).toBe('2026-09-01')
  })
  it('a plain date stays that date', () => {
    const m = normaliseSupabaseRows({ payments: [{ id: 'p', agent_id: 'a', amount: 10, payment_date: '2026-08-15' }] })
    expect(m.payments[0].date).toBe('2026-08-15')
  })
})

/** A tiny fake of the supabase-js query builder over an in-memory table. */
function fakeTable(rows, { error = null, onRange } = {}) {
  const q = {
    order(col) { q._order = col; return q },
    range(from, to) {
      onRange?.(from, to)
      if (error) return Promise.resolve({ data: null, error })
      const sorted = [...rows].sort((a, b) => String(a[q._order]).localeCompare(String(b[q._order])))
      return Promise.resolve({ data: sorted.slice(from, to + 1), error: null })
    },
  }
  return q
}

describe('fetchAll — paging', () => {
  it('reads past 1000 rows, ordered by id, with no row counted twice', async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => ({ id: `id-${String(i).padStart(5, '0')}`, created_at: '2026-09-01T00:00:00Z' }))
    const pages = []
    const out = await fetchAll(() => fakeTable(rows, { onRange: (f) => pages.push(f) }))
    expect(out).toHaveLength(2345)
    expect(new Set(out.map((r) => r.id)).size).toBe(2345)
    expect(pages).toEqual([0, 1000, 2000])
  })

  it('stops the run on a read error (e.g. a renamed column)', async () => {
    await expect(fetchAll(() => fakeTable([], { error: { message: 'column documents.total_amount does not exist' } }))).rejects.toThrow(/total_amount does not exist/)
  })
})

describe('fetchSupabaseRows', () => {
  function client({ profilesError = null } = {}) {
    const tables = {
      documents: [{ id: 'd1', agent_id: 'a1', typed_date: '24 Sep 2026', tax_percent: null, form_tax_percent: '21', shipping_amount: null, form_delivery_cost: null, meta_date: null, rows: [{ total: '100', unitPrice: 'secret' }], total_amount: 121 }],
      events: [], agent_commissions: [], agent_payments: [],
    }
    const profileCalls = []
    return {
      profileCalls,
      from(t) {
        if (t === 'profiles') {
          return { select() { return { in(_c, ids) { profileCalls.push(ids.length); return Promise.resolve(profilesError ? { data: null, error: profilesError } : { data: ids.map((id) => ({ id, full_name: id })), error: null }) } } } }
        }
        const b = { select() { return b }, eq() { return b }, is() { return b }, order: (...a) => fakeTable(tables[t]).order(...a) }
        return b
      },
    }
  }

  it('rebuilds only the metadata fields the rules use (no prices, no client details)', async () => {
    const { documents } = await fetchSupabaseRows(client())
    expect(documents[0].metadata).toEqual({ date: undefined, tax_percent: undefined, shipping_amount: undefined, formState: { date: '24 Sep 2026', taxPercent: '21', deliveryCost: undefined, rows: [{ total: '100' }] } })
    expect(netOrderAmount(documents[0])).toBe(100)
  })

  it('stops the run when agent names cannot be read, instead of sending "Unknown agent"', async () => {
    await expect(fetchSupabaseRows(client({ profilesError: { message: 'timeout' } }))).rejects.toThrow(/agent names.*timeout/)
  })
})
