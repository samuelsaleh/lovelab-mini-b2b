/**
 * IGI give a new model its serial — once, and only to a model waiting for one.
 * Sam, 10 Sept 2026: LoveLab add the model, IGI number it.
 */
import { assignSerial, normaliseSerial } from '../igi/portalActions'
import { todoView } from '../igi/portalViews'
import { toIgiNewModel, FORBIDDEN_TO_IGI } from '../igi/portalShapes'

/** A tiny igi_models table that behaves like the RLS client for these calls. */
function db(rows, { failUpdateWith } = {}) {
  const state = { rows: rows.map((r) => ({ ...r })), updates: [] }
  const api = {
    state,
    from(table) {
      if (table !== 'igi_models') throw new Error(`unexpected table ${table}`)
      let filter = () => true
      let patch = null
      const chain = {
        select: () => chain,
        eq: (col, val) => { const prev = filter; filter = (r) => prev(r) && r[col] === val; return chain },
        maybeSingle: async () => ({ data: state.rows.find(filter) ?? null, error: null }),
        single: async () => {
          if (failUpdateWith) return { data: null, error: failUpdateWith }
          const target = state.rows.find(filter)
          if (!target) return { data: null, error: { message: 'no row' } }
          Object.assign(target, patch)
          state.updates.push({ id: target.id, ...patch })
          return { data: { ...target }, error: null }
        },
        update: (p) => { patch = p; return chain },
      }
      return chain
    },
  }
  return api
}

const WAITING = { id: 'm-new', name: 'Full Moonlight', stones: '1', carat: 0.5, shape: 'Round', spec: null, state: 'awaiting_serial', serial: null, requested_at: '2026-09-10T09:00:00Z' }
const IN_USE = { id: 'm1', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round', spec: null, state: 'in_use', serial: 'LGAJ6530' }

describe('normaliseSerial', () => {
  test('accepts letters then digits, tidying spaces and case', () => {
    expect(normaliseSerial('lgaj 6600')).toBe('LGAJ6600')
    expect(normaliseSerial(' LGAJ-6600 ')).toBe('LGAJ6600')
  })
  test('refuses anything else', () => {
    expect(normaliseSerial('6600')).toBeNull()
    expect(normaliseSerial('LGAJ')).toBeNull()
    expect(normaliseSerial('LGAJ 66 00 extra words')).toBeNull()
    expect(normaliseSerial(null)).toBeNull()
  })
})

describe('assignSerial', () => {
  test('numbers a waiting model, records who did it, and makes it in use', async () => {
    const d = db([WAITING, IN_USE])
    const res = await assignSerial(d, 'igi-user', 'm-new', { serial: 'lgaj 6600' })
    expect(res.status).toBe(200)
    expect(res.body.model).toMatchObject({ id: 'm-new', serial: 'LGAJ6600', state: 'in_use' })
    expect(d.state.updates[0]).toMatchObject({ serial: 'LGAJ6600', state: 'in_use', numbered_by: 'igi-user' })
    expect(d.state.updates[0].numbered_at).toBeTruthy()
  })

  test('keeps the full printed number when given, and insists it starts with the serial', async () => {
    const ok = await assignSerial(db([WAITING]), 'u', 'm-new', { serial: 'LGAJ6600', serial_full: 'lgaj 6600 2509' })
    expect(ok.body.model.serial_full).toBe('LGAJ66002509')
    const bad = await assignSerial(db([WAITING]), 'u', 'm-new', { serial: 'LGAJ6600', serial_full: 'XX99001122' })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toMatch(/start with the serial LGAJ6600/)
    const junk = await assignSerial(db([WAITING]), 'u', 'm-new', { serial: 'LGAJ6600', serial_full: 'LGAJ 6600/25' })
    expect(junk.status).toBe(400)
    expect(junk.body.error).toMatch(/letters and digits/)
  })

  test('refuses a malformed serial before touching the database', async () => {
    const d = db([WAITING])
    const res = await assignSerial(d, 'u', 'm-new', { serial: '6600' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/like LGAJ6529/)
    expect(d.state.updates).toHaveLength(0)
  })

  test('refuses to renumber a model that already has a serial', async () => {
    const d = db([IN_USE])
    const res = await assignSerial(d, 'u', 'm1', { serial: 'LGAJ9999' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already has the serial LGAJ6530/)
    expect(d.state.updates).toHaveLength(0)
  })

  test('refuses a serial another model already carries', async () => {
    const d = db([WAITING, IN_USE])
    const res = await assignSerial(d, 'u', 'm-new', { serial: 'LGAJ6530' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already the serial of Cuty-Cubix/)
  })

  test('turns the unique index refusal into a plain answer', async () => {
    // A reserved serial IGI cannot see, or two people numbering at once.
    const d = db([WAITING], { failUpdateWith: { code: '23505', message: 'duplicate key' } })
    const res = await assignSerial(d, 'u', 'm-new', { serial: 'LGAJ6588' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/LGAJ6588 is already in use/)
  })

  test('says so when the model is gone', async () => {
    const res = await assignSerial(db([]), 'u', 'm-x', { serial: 'LGAJ6600' })
    expect(res.status).toBe(404)
  })
})

describe('the To do carries the new models, and nothing of LoveLab’s', () => {
  const world = {
    visits: [], lines: [], models: [IN_USE], modelById: new Map([[IN_USE.id, IN_USE]]),
    poolFor: () => 0, askedFor: () => 0,
    awaiting: [{ ...WAITING, shelf_min: 25, qty_ordered: null }],
  }
  test('lists them with what they are and when they were asked for', () => {
    const view = todoView(world)
    expect(view.new_models).toEqual([{
      id: 'm-new', name: 'Full Moonlight', stones: '1', carat: 0.5, shape: 'Round', spec: null,
      requested_at: '2026-09-10T09:00:00Z',
    }])
  })
  test('never leaks a forbidden field', () => {
    const json = JSON.stringify(toIgiNewModel({ ...WAITING, shelf: 12, shelf_min: 25, on_shelf: 3 })).toLowerCase()
    for (const field of FORBIDDEN_TO_IGI) expect(json).not.toContain(field)
  })
  test('is empty, not missing, when nothing waits', () => {
    expect(todoView({ ...world, awaiting: [] }).new_models).toEqual([])
    expect(todoView({ ...world, awaiting: undefined }).new_models).toEqual([])
  })
})
