import {
  canAdvance, canBeRequested, whyNotRequestable, canDelete, whyNotDeletable,
  readRequestLines, readIssuedQuantities, VISIT_FLOW, VISIT_LABELS,
} from '../igi/visits'

describe('a movement only ever moves forward', () => {
  it('goes requested to issued to closed', () => {
    expect(canAdvance('requested', 'issued')).toBe(true)
    expect(canAdvance('issued', 'closed')).toBe(true)
  })

  it('refuses to reopen a closed movement', () => {
    // The certificates have been packed by then. A correction belongs in a new
    // movement, where it stays visible.
    expect(canAdvance('closed', 'issued')).toBe(false)
    expect(canAdvance('closed', 'requested')).toBe(false)
    expect(VISIT_FLOW.closed).toBeNull()
  })

  it('refuses to skip the middle step', () => {
    expect(canAdvance('requested', 'closed')).toBe(false)
  })

  it('refuses to record the same step twice', () => {
    expect(canAdvance('issued', 'issued')).toBe(false)
  })

  it('names each state in plain language', () => {
    expect(VISIT_LABELS).toEqual({
      requested: 'Waiting on IGI',
      issued: 'Ready to receive',
      closed: 'Closed',
    })
  })
})

describe('which models may be asked for', () => {
  it('accepts a model in use', () => {
    expect(canBeRequested({ state: 'in_use' })).toBe(true)
    expect(whyNotRequestable({ state: 'in_use' })).toBeNull()
  })

  it('refuses a reserved serial, and says why', () => {
    const m = { state: 'reserved', serial: 'LGAJ6588', name: '—' }
    expect(canBeRequested(m)).toBe(false)
    expect(whyNotRequestable(m)).toMatch(/LGAJ6588.*numbered but never ordered/)
  })

  it('refuses a model still waiting for a serial, and says why', () => {
    // There is nothing to print on the card yet.
    const m = { state: 'awaiting_serial', serial: null, name: 'Full Moonlight' }
    expect(canBeRequested(m)).toBe(false)
    expect(whyNotRequestable(m)).toMatch(/Full Moonlight.*waiting for a serial/)
  })

  it('refuses a model that does not exist', () => {
    expect(whyNotRequestable(undefined)).toMatch(/does not exist/)
  })
})

describe('reading the lines on a new request', () => {
  it('keeps the models asked for', () => {
    const { lines } = readRequestLines([{ model_id: 'a', qty: 50 }, { model_id: 'b', qty: 40 }])
    expect(lines).toEqual([{ model_id: 'a', qty: 50 }, { model_id: 'b', qty: 40 }])
  })

  it('drops a line asking for nothing', () => {
    const { lines } = readRequestLines([{ model_id: 'a', qty: 50 }, { model_id: 'b', qty: 0 }])
    expect(lines).toEqual([{ model_id: 'a', qty: 50 }])
  })

  it('needs at least one model', () => {
    expect(readRequestLines([]).error).toMatch(/at least one model/)
    expect(readRequestLines(null).error).toMatch(/at least one model/)
  })

  it('refuses a request where everything is zero', () => {
    expect(readRequestLines([{ model_id: 'a', qty: 0 }]).error).toMatch(/asks for nothing/)
  })

  it('refuses the same model twice, so the stock is counted once', () => {
    const { error } = readRequestLines([{ model_id: 'a', qty: 10 }, { model_id: 'a', qty: 5 }])
    expect(error).toMatch(/listed twice/)
  })

  it('refuses a quantity that is not a whole number', () => {
    expect(readRequestLines([{ model_id: 'a', qty: 2.5 }]).error).toMatch(/whole number/)
    expect(readRequestLines([{ model_id: 'a', qty: -1 }]).error).toMatch(/whole number/)
  })

  it('refuses a line with no model', () => {
    expect(readRequestLines([{ qty: 10 }]).error).toMatch(/no model/)
  })

  it('will not take an unbounded number of lines', () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ model_id: `m${i}`, qty: 1 }))
    expect(readRequestLines(many).error).toMatch(/too many models/)
  })
})

describe('reading what IGI actually made', () => {
  const lines = [
    { model_id: 'a', qty_requested: 100 },
    { model_id: 'b', qty_requested: 40 },
  ]

  it('accepts fewer than were asked for, which is normal', () => {
    const { byModel } = readIssuedQuantities({ a: 60, b: 40 }, lines)
    expect(byModel.get('a')).toBe(60)
    expect(byModel.get('b')).toBe(40)
  })

  it('accepts none of a model', () => {
    const { byModel } = readIssuedQuantities({ a: 0, b: 40 }, lines)
    expect(byModel.get('a')).toBe(0)
  })

  it('takes a blank as "all of them"', () => {
    const { byModel } = readIssuedQuantities({ a: '', b: 40 }, lines)
    expect(byModel.get('a')).toBe(100)
  })

  it('takes a missing model as "all of them"', () => {
    const { byModel } = readIssuedQuantities({ b: 40 }, lines)
    expect(byModel.get('a')).toBe(100)
  })

  it('allows more than asked, because that physically happens', () => {
    // Refusing it would block a real delivery at five o'clock on a Friday.
    const { byModel, error } = readIssuedQuantities({ a: 120, b: 40 }, lines)
    expect(error).toBeUndefined()
    expect(byModel.get('a')).toBe(120)
  })

  it('refuses a quantity that is not a whole number', () => {
    expect(readIssuedQuantities({ a: 1.5, b: 40 }, lines).error).toMatch(/whole number/)
    expect(readIssuedQuantities({ a: -1, b: 40 }, lines).error).toMatch(/whole number/)
  })

  it('needs something to read', () => {
    expect(readIssuedQuantities(null, lines).error).toMatch(/how many/)
  })
})

describe('deleting a movement', () => {
  const made = { id: 'v1', visit_no: 24, status: 'requested', created_by: 'u1' }
  const imported = { id: 'v2', visit_no: 3, status: 'closed', created_by: null }

  it('allows a movement this app created', () => {
    expect(canDelete(made)).toBe(true)
    expect(whyNotDeletable(made)).toBeNull()
  })

  it('refuses a movement imported from IGI’s file', () => {
    // The 23 historical movements are the record of what actually happened
    // between two companies. Nothing in the UI should be able to reach them.
    expect(canDelete(imported)).toBe(false)
    expect(whyNotDeletable(imported)).toMatch(/imported history/i)
  })

  it('refuses the daily-total movements, which carry no author either', () => {
    // The nine movements between 16 June and 28 July hold 3 245 certificates
    // with no model detail. They are the least reconstructable rows in the
    // table, so they are also the least deletable.
    const gap = { id: 'v3', visit_no: 11, status: 'closed', created_by: null, unattributed_total: 694 }
    expect(canDelete(gap)).toBe(false)
  })

  it('does not care what state the movement is in', () => {
    // A test pushed all the way to closed is the one you most want gone, and
    // it is safe: no stock figure is stored, so removing the lines reverts it.
    for (const status of ['requested', 'issued', 'closed']) {
      expect(canDelete({ ...made, status })).toBe(true)
    }
  })

  it('refuses a movement that does not exist', () => {
    expect(canDelete(null)).toBe(false)
    expect(whyNotDeletable(undefined)).toMatch(/does not exist/i)
  })
})
