/**
 * IGI report a problem with a request; LoveLab answer it (Mika, 16 Oct 2026).
 *
 * The case that started it: V-041 asked for 96 × LGAJ6538 (4 stones, 0,40 ct).
 * Sixty were that model; thirty-six were 8-stone Riviera and needed LGAJ6575.
 */
import {
  readProblemReport, applyProposal, describeProposal, reportProblem, resolveProblem,
} from '../igi/problems'
import { notifyLovelabOfProblem, notifyIgiOfAnswer } from '../igi/notify'
import { lovelabProblemEmail, igiProblemAnsweredEmail } from '../igi/emails'

const M6538 = { id: 'm38', serial: 'LGAJ6538', name: 'Multi 4 / Sienna 4 / Riviera 4', stones: '4', carat: 0.4, shape: 'Round', spec: null, state: 'in_use' }
const M6575 = { id: 'm75', serial: 'LGAJ6575', name: 'Riviera 8', stones: '8', carat: 0.4, shape: 'Round', spec: 'D/E', state: 'in_use' }
const M6537 = { id: 'm37', serial: 'LGAJ6537', name: 'Multi 4 / Sienna 4 / Riviera 4', stones: '4', carat: 0.2, shape: 'Round', spec: null, state: 'in_use' }
const RESERVED = { id: 'mr', serial: 'LGAJ6599', name: 'Reserved', state: 'reserved' }

/** An in-memory stand-in for the Supabase client: enough of the query builder for these actions. */
function fakeDb(seed) {
  const t = JSON.parse(JSON.stringify(seed))
  const calls = { rpc: [] }
  let nextId = 1

  function query(table) {
    const filters = []
    let op = 'select'
    let payload = null
    const matches = (r) => filters.every((f) => f(r))
    const rows = () => (t[table] || []).filter(matches)
    const run = () => {
      if (op === 'update') {
        rows().forEach((r) => Object.assign(r, payload))
        return { data: null, error: null }
      }
      if (op === 'delete') {
        t[table] = (t[table] || []).filter((r) => !matches(r))
        return { data: null, error: null }
      }
      return { data: rows(), error: null }
    }
    const chain = {
      select: () => chain,
      eq: (c, v) => { filters.push((r) => r[c] === v); return chain },
      is: (c, v) => { filters.push((r) => (r[c] ?? null) === v); return chain },
      in: (c, vs) => { filters.push((r) => vs.includes(r[c])); return chain },
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      update: (p) => { op = 'update'; payload = p; return chain },
      delete: () => { op = 'delete'; return chain },
      insert: async (list) => {
        t[table] = [...(t[table] || []), ...list.map((r) => ({ id: `new${nextId++}`, ...r }))]
        return { data: null, error: null }
      },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    }
    return chain
  }

  return {
    tables: t,
    calls,
    from: query,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args })
      const visit = t.igi_visits.find((v) => v.id === args.p_visit_id)
      if (!visit || visit.status !== 'requested') return { data: null, error: { message: 'igi_visit_not_waiting' } }
      visit.status = 'on_hold'
      t.igi_visit_problems.push({
        id: 'p1', visit_id: visit.id, note: args.p_note, proposal: args.p_proposal,
        reported_by: args.p_user, reported_at: '2026-10-16T13:30:00Z', resolution: null, reply: null, resolved_at: null,
      })
      return { data: 'p1', error: null }
    },
  }
}

function v041(status = 'requested', problems = []) {
  return {
    igi_visits: [{ id: 'v41', visit_no: 41, visit_date: '2026-10-14', status, note: null }],
    igi_visit_lines: [
      { id: 'l1', visit_id: 'v41', model_id: 'm38', qty_requested: 96, qty_issued: null, qty_received: null },
      { id: 'l2', visit_id: 'v41', model_id: 'm37', qty_requested: 46, qty_issued: null, qty_received: null },
    ],
    igi_models: [M6538, M6575, M6537, RESERVED],
    igi_batches: [],
    igi_counts: [],
    igi_visit_problems: problems,
    profiles: [{ email: 'mika@igi.org', is_igi: true }],
  }
}

const OPEN_PROBLEM = {
  id: 'p1', visit_id: 'v41', note: '36 of these have 8 stones: they need LGAJ6575.',
  proposal: [{ model_id: 'm38', qty: 60 }, { model_id: 'm75', qty: 36 }],
  reported_by: 'igi-user', reported_at: '2026-10-16T13:30:00Z', resolution: null, reply: null, resolved_at: null,
}

const LINES = [{ model_id: 'm38', qty_requested: 96 }, { model_id: 'm37', qty_requested: 46 }]

describe('reading what IGI typed', () => {
  it('takes a note and the quantities that change', () => {
    const r = readProblemReport({
      note: '  36 are 8 stones  ',
      proposal: [{ model_id: 'm38', qty: '60' }, { model_id: 'm75', qty: 36 }],
    }, LINES, [M6538, M6575, M6537])
    expect(r).toEqual({ note: '36 are 8 stones', proposal: [{ model_id: 'm38', qty: 60 }, { model_id: 'm75', qty: 36 }] })
  })

  it('needs a note', () => {
    expect(readProblemReport({ note: ' ', proposal: [] }, LINES, []).error).toMatch(/what is wrong/)
  })

  it('drops a line left blank or unchanged, and a removal of what is not there', () => {
    const r = readProblemReport({
      note: 'x',
      proposal: [{ model_id: 'm38', qty: '' }, { model_id: 'm37', qty: 46 }, { model_id: 'm75', qty: 0 }],
    }, LINES, [M6575])
    expect(r.proposal).toEqual([])
  })

  it('refuses a model that cannot be asked for, a bad number, and the same model twice', () => {
    expect(readProblemReport({ note: 'x', proposal: [{ model_id: 'mr', qty: 3 }] }, LINES, [M6575]).error).toMatch(/cannot be asked/)
    expect(readProblemReport({ note: 'x', proposal: [{ model_id: 'm38', qty: -1 }] }, LINES, []).error).toMatch(/whole number/)
    expect(readProblemReport({ note: 'x', proposal: [{ model_id: 'm38', qty: 1.5 }] }, LINES, []).error).toMatch(/whole number/)
    expect(readProblemReport({ note: 'x', proposal: [{ model_id: 'm38', qty: 1 }, { model_id: 'm38', qty: 2 }] }, LINES, []).error).toMatch(/twice/)
  })
})

describe('applying a proposal', () => {
  it('turns V-041 into 60 × LGAJ6538 and 36 × LGAJ6575, leaving the other line alone', () => {
    expect(applyProposal(LINES, OPEN_PROBLEM.proposal)).toEqual([
      { model_id: 'm38', qty: 60 },
      { model_id: 'm37', qty: 46 },
      { model_id: 'm75', qty: 36 },
    ])
  })

  it('takes a line off at 0', () => {
    expect(applyProposal(LINES, [{ model_id: 'm37', qty: 0 }])).toEqual([{ model_id: 'm38', qty: 96 }])
  })

  it('describes each change beside what was asked', () => {
    const byId = new Map([M6538, M6575].map((m) => [m.id, m]))
    expect(describeProposal(LINES, OPEN_PROBLEM.proposal, byId)).toEqual([
      expect.objectContaining({ serial: 'LGAJ6538', from: 96, to: 60 }),
      expect.objectContaining({ serial: 'LGAJ6575', spec: 'D/E', from: null, to: 36 }),
    ])
  })
})

describe('IGI report a problem', () => {
  it('puts the request on hold in one step, in their own name', async () => {
    const db = fakeDb(v041())
    const r = await reportProblem(db, 'igi-user', 'v41', {
      note: '36 are 8 stones',
      proposal: [{ model_id: 'm38', qty: 60 }, { model_id: 'm75', qty: 36 }],
    })
    expect(r).toEqual({ status: 200, body: { visit_no: 41, problem_id: 'p1', changes: 2 } })
    expect(db.calls.rpc).toEqual([{
      name: 'igi_report_problem',
      args: { p_visit_id: 'v41', p_user: 'igi-user', p_note: '36 are 8 stones', p_proposal: [{ model_id: 'm38', qty: 60 }, { model_id: 'm75', qty: 36 }] },
    }])
    expect(db.tables.igi_visits[0].status).toBe('on_hold')
    // What LoveLab asked for is untouched until LoveLab answer.
    expect(db.tables.igi_visit_lines.map((l) => l.qty_requested)).toEqual([96, 46])
  })

  it('refuses a second report, and a request already sent back', async () => {
    expect((await reportProblem(fakeDb(v041('on_hold')), 'u', 'v41', { note: 'x' })).status).toBe(409)
    expect((await reportProblem(fakeDb(v041('issued')), 'u', 'v41', { note: 'x' })).status).toBe(409)
  })

  it('answers plainly when the request moved on in between', async () => {
    const db = fakeDb(v041())
    db.rpc = async () => ({ data: null, error: { message: 'igi_visit_not_waiting' } })
    const r = await reportProblem(db, 'u', 'v41', { note: 'x' })
    expect(r).toEqual({ status: 409, body: { error: 'This request is no longer waiting on you.' } })
  })

  it('refuses a report with no note before touching anything', async () => {
    const db = fakeDb(v041())
    expect((await reportProblem(db, 'u', 'v41', { note: '' })).status).toBe(400)
    expect(db.calls.rpc).toEqual([])
  })
})

describe('LoveLab answer', () => {
  it('accept: applies IGI’s correction and sends it back to IGI', async () => {
    const db = fakeDb(v041('on_hold', [OPEN_PROBLEM]))
    const r = await resolveProblem(db, 'sam', 'v41', { action: 'accept', reply: 'Thanks Mika' })
    expect(r).toEqual({ status: 200, body: { visit_no: 41, resolution: 'accepted', total: 142 } })
    const lines = Object.fromEntries(db.tables.igi_visit_lines.map((l) => [l.model_id, l.qty_requested]))
    expect(lines).toEqual({ m38: 60, m37: 46, m75: 36 })
    expect(db.tables.igi_visits[0].status).toBe('requested')
    expect(db.tables.igi_visit_problems[0]).toMatchObject({ resolution: 'accepted', reply: 'Thanks Mika', resolved_by: 'sam' })
    expect(db.tables.igi_visit_problems[0].resolved_at).toBeTruthy()
  })

  it('accept twice gives the same request, so an interrupted answer can be pressed again', async () => {
    const db = fakeDb(v041('on_hold', [OPEN_PROBLEM]))
    db.tables.igi_visit_lines[0].qty_requested = 60 // the first attempt got this far
    await resolveProblem(db, 'sam', 'v41', { action: 'accept' })
    const lines = Object.fromEntries(db.tables.igi_visit_lines.map((l) => [l.model_id, l.qty_requested]))
    expect(lines).toEqual({ m38: 60, m37: 46, m75: 36 })
  })

  it('edit: replaces the lines with LoveLab’s own, taking off what is at 0', async () => {
    const db = fakeDb(v041('on_hold', [OPEN_PROBLEM]))
    const r = await resolveProblem(db, 'sam', 'v41', {
      action: 'edit',
      lines: [{ model_id: 'm38', qty: 58 }, { model_id: 'm37', qty: 0 }, { model_id: 'm75', qty: 38 }],
    })
    expect(r.body).toMatchObject({ resolution: 'edited', total: 96 })
    const lines = Object.fromEntries(db.tables.igi_visit_lines.map((l) => [l.model_id, l.qty_requested]))
    expect(lines).toEqual({ m38: 58, m75: 38 })
  })

  it('keep: changes nothing but still sends it back', async () => {
    const db = fakeDb(v041('on_hold', [OPEN_PROBLEM]))
    const r = await resolveProblem(db, 'sam', 'v41', { action: 'keep', reply: 'They are all 4 stones' })
    expect(r.body).toMatchObject({ resolution: 'kept', total: 142 })
    expect(db.tables.igi_visit_lines.map((l) => l.qty_requested)).toEqual([96, 46])
    expect(db.tables.igi_visits[0].status).toBe('requested')
  })

  it('refuses a request that is not on hold, an unknown action, a model that cannot be asked for, and an empty request', async () => {
    expect((await resolveProblem(fakeDb(v041('requested')), 'sam', 'v41', { action: 'keep' })).status).toBe(409)
    expect((await resolveProblem(fakeDb(v041('on_hold', [OPEN_PROBLEM])), 'sam', 'v41', { action: 'maybe' })).status).toBe(400)
    const reserved = await resolveProblem(fakeDb(v041('on_hold', [OPEN_PROBLEM])), 'sam', 'v41', {
      action: 'edit', lines: [{ model_id: 'mr', qty: 3 }],
    })
    expect(reserved.status).toBe(400)
    expect(reserved.body.error).toMatch(/reserved serial/)
    const nothing = await resolveProblem(fakeDb(v041('on_hold', [OPEN_PROBLEM])), 'sam', 'v41', {
      action: 'edit', lines: [{ model_id: 'm38', qty: 0 }],
    })
    expect(nothing.status).toBe(400)
  })
})

describe('the two emails', () => {
  it('tells Liuba what IGI think is wrong, beside what was asked', async () => {
    const db = fakeDb(v041('on_hold', [OPEN_PROBLEM]))
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const r = await notifyLovelabOfProblem(db, { visitId: 'v41', siteUrl: 'https://app.test' }, { sendEmail, env: {} })
    expect(r).toEqual({ sent: true, recipients: ['liuba.lovelab@gmail.com'] })
    const mail = sendEmail.mock.calls[0][0]
    expect(mail.to).toEqual(['liuba.lovelab@gmail.com'])
    expect(mail.subject).toBe('IGI put V-041 on hold: they think the request is wrong')
    expect(mail.html).toContain('36 of these have 8 stones')
    expect(mail.html).toContain('LGAJ6575')
    expect(mail.html).toContain('D/E')
    expect(mail.html).toContain('https://app.test/certificates/visits/v41')
  })

  it('tells IGI LoveLab’s answer, with the request as it now stands', async () => {
    const answered = { ...OPEN_PROBLEM, resolution: 'accepted', reply: 'Thanks', resolved_at: '2026-10-16T14:00:00Z' }
    const db = fakeDb(v041('requested', [answered]))
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const r = await notifyIgiOfAnswer(db, { visitId: 'v41', siteUrl: 'https://app.test' }, { sendEmail, env: { IGI_EMAILS: '' } })
    expect(r).toEqual({ sent: true, recipients: ['mika@igi.org'] })
    const mail = sendEmail.mock.calls[0][0]
    expect(mail.subject).toBe('V-041: updated, you can go ahead')
    expect(mail.html).toContain('LoveLab accepted your correction.')
    expect(mail.html.toLowerCase()).not.toContain('shelf')
  })

  it('says "kept as it was" when LoveLab kept it', () => {
    const { subject, html } = igiProblemAnsweredEmail({
      visit: { id: 'v41', visit_no: 41 },
      problem: { resolution: 'kept', reply: null },
      lines: [{ serial: 'LGAJ6538', name: 'x', qty_requested: 96 }],
    })
    expect(subject).toBe('V-041: kept as it was, you can go ahead')
    expect(html).toContain('LoveLab kept the request as it was.')
  })

  it('escapes what IGI typed', () => {
    const { html } = lovelabProblemEmail({ visit: { id: 'v', visit_no: 1 }, problem: { note: '<script>x</script>' }, changes: [] })
    expect(html).not.toContain('<script>x')
  })
})
