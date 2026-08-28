import {
  canAdvance, canBeRequested, whyNotRequestable,
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
