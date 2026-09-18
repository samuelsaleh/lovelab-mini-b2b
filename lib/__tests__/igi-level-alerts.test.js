/**
 * The email that says a model crossed a level — once per crossing.
 */
import { levelBreaches, levelAlertEmail, igiLevelEmail, runLevelAlerts } from '../igi/levelAlerts'

const base = { state: 'in_use', serial: 'LGAJ6552', name: 'Shapy Shine', stones: '1', carat: 0.5, shape: 'Heart', shelf_min: 25, order_min: 500 }
const LOW_SHELF = { ...base, id: 'a', shelf: 2, pool: 900, shelf_status: 'collect', order_status: 'fine', shelf_alerted_at: null, order_alerted_at: null }
const LOW_IGI = { ...base, id: 'b', name: 'Multi Three', serial: 'LGAJ6536', shelf: 90, pool: 240, shelf_status: 'fine', order_status: 'order', shelf_alerted_at: null, order_alerted_at: null }
const ALREADY_TOLD = { ...LOW_IGI, id: 'c', order_alerted_at: '2026-09-01T00:00:00Z' }
const RECOVERED = { ...base, id: 'd', shelf: 80, pool: 900, shelf_status: 'fine', order_status: 'fine', shelf_alerted_at: '2026-09-01T00:00:00Z', order_alerted_at: null }
const RESERVED = { ...LOW_SHELF, id: 'e', state: 'reserved' }

describe('levelBreaches', () => {
  it('finds new crossings only, and what came back above', () => {
    const b = levelBreaches([LOW_SHELF, LOW_IGI, ALREADY_TOLD, RECOVERED, RESERVED])
    expect(b.shelf.map((m) => m.id)).toEqual(['a'])
    expect(b.order.map((m) => m.id)).toEqual(['b'])
    expect(b.recovered.shelf.map((m) => m.id)).toEqual(['d'])
    expect(b.recovered.order).toEqual([])
  })
})

describe('levelAlertEmail', () => {
  it('names both lists in the subject and shows figure beside level', () => {
    const { subject, html } = levelAlertEmail({ shelf: [LOW_SHELF], order: [LOW_IGI] })
    expect(subject).toBe('Certificates: 1 model to collect, 1 to order from IGI')
    expect(html).toContain('Shapy Shine')
    expect(html).toContain('Multi Three')
    expect(html).toMatch(/Order from IGI/)
    expect(html).toContain('/certificates')
    expect(html).toMatch(/once per crossing/)
  })
  it('leaves out an empty section', () => {
    const { subject, html } = levelAlertEmail({ shelf: [], order: [LOW_IGI] })
    expect(subject).toBe('Certificates: 1 to order from IGI')
    expect(html).not.toMatch(/Go collect/)
  })
})

describe('runLevelAlerts', () => {
  function admin() {
    const updates = []
    return {
      updates,
      from: () => ({ update: (patch) => ({ in: async (_col, ids) => { updates.push({ ids, patch }); return { error: null } } }) }),
    }
  }

  it('emails once, stamps the models, and clears the ones that recovered', async () => {
    const db = admin()
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const s = await runLevelAlerts(db, {
      models: [LOW_SHELF, LOW_IGI, ALREADY_TOLD, RECOVERED], sendEmail, igiRecipients: [],
      recipients: ['alberto@love-lab.com', 'office@love-lab.com'], now: '2026-09-11T05:00:00Z',
    })
    expect(s).toMatchObject({ emailed: true, shelf: ['a'], order: ['b'], recovered: 1, igi_emailed: false })
    // No IGI account yet: nobody to tell, and that is not a failure.
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0][0].to).toEqual(['alberto@love-lab.com', 'office@love-lab.com'])
    expect(sendEmail.mock.calls[0][0].subject).toBe('Certificates: 1 model to collect, 1 to order from IGI')
    expect(db.updates).toEqual([
      { ids: ['d'], patch: { shelf_alerted_at: null } },
      { ids: ['a'], patch: { shelf_alerted_at: '2026-09-11T05:00:00.000Z' } },
      { ids: ['b'], patch: { order_alerted_at: '2026-09-11T05:00:00.000Z' } },
    ])
  })

  it('finds its own recipients when none are injected — the cron passes none', async () => {
    // Regression: getAdminNotificationRecipients() returns { to, cc, all }; spreading
    // the object threw on the first real breach, so no level email ever went out.
    const db = admin()
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const s = await runLevelAlerts(db, { models: [LOW_SHELF], sendEmail, igiRecipients: [] })
    expect(s.emailed).toBe(true)
    expect(s.recipients.length).toBeGreaterThan(0)
    expect(s.recipients.every((r) => typeof r === 'string' && r.includes('@'))).toBe(true)
  })

  it('sends nothing when nothing new crossed, but still clears recoveries', async () => {
    const db = admin()
    const sendEmail = jest.fn()
    const s = await runLevelAlerts(db, { models: [ALREADY_TOLD, RECOVERED], sendEmail, recipients: ['x@y.z'] })
    expect(s.emailed).toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(db.updates).toEqual([{ ids: ['d'], patch: { shelf_alerted_at: null } }])
  })

  it('does not stamp a model when the email did not go out', async () => {
    const db = admin()
    const sendEmail = jest.fn(async () => ({ sent: false, reason: 'no_api_key' }))
    const s = await runLevelAlerts(db, { models: [LOW_IGI], sendEmail, recipients: ['x@y.z'], igiRecipients: [] })
    expect(s).toMatchObject({ emailed: false, reason: 'no_api_key' })
    expect(db.updates).toEqual([])
  })

  it('says so when nobody is configured to receive it', async () => {
    const s = await runLevelAlerts(admin(), { models: [LOW_IGI], sendEmail: jest.fn(), recipients: [] })
    expect(s.reason).toBe('no_recipients')
  })
})

describe('IGI get their own copy (Sam, 16 Sept 2026)', () => {
  function admin() {
    const updates = []
    return {
      updates,
      from: () => ({ update: (patch) => ({ in: async (_col, ids) => { updates.push({ ids, patch }); return { error: null } } }) }),
    }
  }

  it('says what they hold against the level LoveLab want, and never mentions the shelf', () => {
    const { subject, html } = igiLevelEmail([LOW_IGI], 'https://x.test')
    expect(subject).toBe('LoveLab need more of 1 model')
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('Multi Three')
    expect(html).toContain('LGAJ6536')
    expect(html).toMatch(/240/)
    expect(html).toMatch(/500/)
    expect(html).toMatch(/260/)
    expect(html).toContain('https://x.test/igi')
    expect(html.toLowerCase()).not.toContain('shelf')
  })

  it('sends IGI a second email for the crossings on their stock only, then stamps', async () => {
    const db = admin()
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const s = await runLevelAlerts(db, {
      models: [LOW_SHELF, LOW_IGI], sendEmail, now: '2026-09-11T05:00:00Z',
      recipients: ['office@love-lab.com'], igiRecipients: ['michael@igi.test'],
    })
    expect(s).toMatchObject({ emailed: true, igi_emailed: true, igi_recipients: ['michael@igi.test'] })
    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(sendEmail.mock.calls[1][0].to).toEqual(['michael@igi.test'])
    expect(sendEmail.mock.calls[1][0].subject).toBe('LoveLab need more of 1 model')
    expect(sendEmail.mock.calls[1][0].html.toLowerCase()).not.toContain('shelf')
    expect(db.updates).toEqual([
      { ids: ['a'], patch: { shelf_alerted_at: '2026-09-11T05:00:00.000Z' } },
      { ids: ['b'], patch: { order_alerted_at: '2026-09-11T05:00:00.000Z' } },
    ])
  })

  it('does not write to IGI when only the shelf crossed', async () => {
    const sendEmail = jest.fn(async () => ({ sent: true }))
    await runLevelAlerts(admin(), { models: [LOW_SHELF], sendEmail, recipients: ['office@love-lab.com'], igiRecipients: ['michael@igi.test'] })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('leaves the stamp off when IGI\'s copy did not go out, so LoveLab hear again tomorrow', async () => {
    const db = admin()
    const sendEmail = jest.fn()
      .mockResolvedValueOnce({ sent: true })
      .mockResolvedValueOnce({ sent: false, reason: 'send_failed' })
    const s = await runLevelAlerts(db, { models: [LOW_IGI], sendEmail, recipients: ['office@love-lab.com'], igiRecipients: ['michael@igi.test'] })
    expect(s).toMatchObject({ emailed: true, igi_emailed: false, igi_reason: 'send_failed' })
    expect(db.updates).toEqual([])
  })

  it('reads IGI\'s users from the profiles flagged is_igi', async () => {
    const rows = [{ email: 'Michael@igi.test' }, { email: 'michael@igi.test' }, { email: null }]
    const db = {
      from: (t) => ({
        select: () => ({ eq: async (col, v) => ({ data: t === 'profiles' && col === 'is_igi' && v === true ? rows : [], error: null }) }),
        update: (patch) => ({ in: async () => ({ error: null }) }),
      }),
    }
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const s = await runLevelAlerts(db, { models: [LOW_IGI], sendEmail, recipients: ['office@love-lab.com'] })
    expect(s.igi_recipients).toEqual(['michael@igi.test'])
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })
})
