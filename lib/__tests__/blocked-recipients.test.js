/**
 * @jest-environment node
 */
const { blockedRecipients, _resetEmailDeliveriesProbe } = require('../emailDeliveries')

function db(rows, { tableMissing = false } = {}) {
  return {
    from: () => {
      const q = {
        select: () => q,
        limit: () => Promise.resolve({ error: tableMissing ? { message: 'no table' } : null }),
        in: (col, vals) => { q._f = (q._f || []).concat([(r) => vals.includes(r[col])]); return q },
        then: (res, rej) => Promise.resolve({ data: rows.filter((r) => (q._f || []).every((f) => f(r))), error: null }).then(res, rej),
      }
      return q
    },
  }
}

describe('blockedRecipients', () => {
  beforeEach(() => _resetEmailDeliveriesProbe())

  it('blocks hard bounces, complaints and suppressed, ignores soft bounces', async () => {
    const rows = [
      { recipient: 'a@x.com', status: 'bounced', bounce_type: 'Permanent' },
      { recipient: 'b@x.com', status: 'bounced', bounce_type: 'Transient' },
      { recipient: 'c@x.com', status: 'complained' },
      { recipient: 'd@x.com', status: 'suppressed' },
    ]
    const m = await blockedRecipients(db(rows), ['A@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'ok@x.com'])
    expect([...m.keys()].sort()).toEqual(['a@x.com', 'c@x.com', 'd@x.com'])
    expect(m.get('c@x.com')).toMatch(/spam/i)
  })

  it('blocks nothing when the table does not exist yet', async () => {
    const m = await blockedRecipients(db([], { tableMissing: true }), ['a@x.com'])
    expect(m.size).toBe(0)
  })

  it('returns empty for no addresses', async () => {
    expect((await blockedRecipients(db([]), [])).size).toBe(0)
  })

  it('finds an address stored with capital letters', async () => {
    const m = await blockedRecipients(db([{ recipient: 'Bob@Shop.com', status: 'bounced', bounce_type: 'Permanent' }]), ['Bob@Shop.com'])
    expect(m.has('bob@shop.com')).toBe(true)
  })
})
