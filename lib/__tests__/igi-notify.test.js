/**
 * Telling the other side of the road (Sam, 18 Sept 2026): the request email
 * to IGI, what happens when it fails, and the two shortfall emails.
 */
import { notifyIgiOfRequest, notifyLovelabOfIssue, notifyIgiOfShortReturn, igiRecipients, describeFailure } from '../igi/notify'

const VISIT = { id: 'v1', visit_no: 33, visit_date: '2026-09-18', status: 'requested', note: null }
const MODELS = [
  { id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round' },
  { id: 'm2', serial: 'LGAJ6552', name: 'Shapy Shine', stones: '1', carat: 0.5, shape: 'Heart' },
]

/** A service-role stand-in: rows per table, and every update recorded. */
function db(tables) {
  const updates = []
  return {
    updates,
    from(table) {
      const rows = tables[table] ?? []
      let filtered = rows
      const chain = {
        select: () => chain,
        eq: (col, v) => { filtered = filtered.filter((r) => r[col] === v); return chain },
        maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
        update: (patch) => ({ eq: async (_c, id) => { updates.push({ table, id, patch }); return { error: null } } }),
        then: (resolve) => resolve({ data: filtered, error: null }),
      }
      return chain
    },
  }
}

function tables(over = {}) {
  return {
    igi_visits: [VISIT],
    igi_visit_lines: [
      { id: 'l1', visit_id: 'v1', model_id: 'm1', qty_requested: 100, qty_issued: null, qty_received: null },
      { id: 'l2', visit_id: 'v1', model_id: 'm2', qty_requested: 500, qty_issued: null, qty_received: null },
    ],
    igi_models: MODELS,
    igi_batches: [{ model_id: 'm1', qty: 1000 }, { model_id: 'm2', qty: 41 }],
    igi_counts: [],
    profiles: [{ email: 'Michael@IGI.org', is_igi: true }],
    ...over,
  }
}

const NOW = '2026-09-18T10:32:00.000Z'

describe('igiRecipients', () => {
  it('joins every IGI login with the IGI_EMAILS list, once each', async () => {
    const list = await igiRecipients(db(tables()), { IGI_EMAILS: 'michael@igi.org, hardik@igi.org' })
    expect(list).toEqual(['michael@igi.org', 'hardik@igi.org'])
  })
  it('still has the env list when profiles cannot be read', async () => {
    const broken = { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: 'nope' } }) }) }) }
    expect(await igiRecipients(broken, { IGI_EMAILS: 'michael@igi.org' })).toEqual(['michael@igi.org'])
  })
})

describe('notifyIgiOfRequest', () => {
  it('emails IGI the request and stamps the movement', async () => {
    const d = db(tables())
    const sendEmail = jest.fn(async () => ({ sent: true, message_id: 'x' }))
    const r = await notifyIgiOfRequest(d, { visitId: 'v1', siteUrl: 'https://app.test' }, { sendEmail, env: { IGI_EMAILS: '' }, now: NOW })
    expect(r).toEqual({ sent: true, recipients: ['michael@igi.org'], notified_at: NOW })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const mail = sendEmail.mock.calls[0][0]
    expect(mail.to).toEqual(['michael@igi.org'])
    expect(mail.subject).toBe('LoveLab ask for 600 certificates — V-033')
    expect(mail.html).toMatch(/459/)                      // short against what they hold
    expect(mail.html.toLowerCase()).not.toContain('shelf')
    expect(d.updates).toEqual([{ table: 'igi_visits', id: 'v1', patch: { notified_at: NOW, notify_error: null } }])
  })

  it('on failure stamps the reason, tells the admins, records a health event — and never throws', async () => {
    const d = db(tables())
    const sendEmail = jest.fn()
      .mockResolvedValueOnce({ sent: false, reason: 'resend_error', status: 422, error: 'Invalid `to`' })
      .mockResolvedValueOnce({ sent: true })
    const recordHealthEvent = jest.fn(async () => ({ ok: true }))
    const r = await notifyIgiOfRequest(d, { visitId: 'v1', siteUrl: 'https://app.test' }, { sendEmail, recordHealthEvent, env: { IGI_EMAILS: '' } })
    expect(r.sent).toBe(false)
    expect(r.reason).toBe('resend_error')
    expect(r.error).toBe('resend_error (HTTP 422): Invalid `to`')
    expect(d.updates).toEqual([{ table: 'igi_visits', id: 'v1', patch: { notify_error: 'resend_error (HTTP 422): Invalid `to`' } }])
    // Second send is the admin notice, with a link to the movement.
    expect(sendEmail).toHaveBeenCalledTimes(2)
    const admin = sendEmail.mock.calls[1][0]
    expect(admin.subject).toMatch(/Order V-033 did not reach IGI/)
    expect(admin.html).toContain('https://app.test/certificates/visits/v1')
    expect(admin.to.length).toBeGreaterThan(0)
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'igi_request_email', severity: 'error', alertAdmin: false }))
  })

  it('with nobody to send to, says so on the movement and sends nothing', async () => {
    const d = db(tables({ profiles: [] }))
    const sendEmail = jest.fn()
    const r = await notifyIgiOfRequest(d, { visitId: 'v1', siteUrl: 'https://app.test' }, { sendEmail, env: { IGI_EMAILS: '' } })
    expect(r).toEqual({ sent: false, reason: 'no_recipients', recipients: [] })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(d.updates[0].patch).toEqual({ notify_error: 'No IGI address to send to' })
  })

  it('a missing email key reads as a configuration problem', () => {
    expect(describeFailure({ sent: false, reason: 'no_api_key' })).toMatch(/RESEND_API_KEY/)
  })
})

describe('notifyLovelabOfIssue', () => {
  it('tells LoveLab what was made, with the lines fewer than asked', async () => {
    const d = db(tables({
      igi_visits: [{ ...VISIT, status: 'issued' }],
      igi_visit_lines: [
        { id: 'l1', visit_id: 'v1', model_id: 'm1', qty_requested: 100, qty_issued: 100, qty_received: null },
        { id: 'l2', visit_id: 'v1', model_id: 'm2', qty_requested: 500, qty_issued: 41, qty_received: null },
      ],
    }))
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const r = await notifyLovelabOfIssue(d, { visitId: 'v1', siteUrl: 'https://app.test' }, { sendEmail, recipients: ['alberto@love-lab.com'] })
    expect(r).toEqual({ sent: true, recipients: ['alberto@love-lab.com'] })
    expect(sendEmail.mock.calls[0][0].subject).toBe('IGI made V-033: 141 certificates — 1 model fewer than asked')
  })

  it('records a health event when the email fails, and does not throw', async () => {
    const d = db(tables({ igi_visits: [{ ...VISIT, status: 'issued' }] }))
    const recordHealthEvent = jest.fn(async () => ({ ok: true }))
    const r = await notifyLovelabOfIssue(d, { visitId: 'v1' }, { sendEmail: async () => ({ sent: false, reason: 'network_error' }), recordHealthEvent, recipients: ['a@b.c'] })
    expect(r.sent).toBe(false)
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'igi_issued_email', severity: 'warn' }))
  })
})

describe('notifyIgiOfShortReturn', () => {
  const closed = (received) => tables({
    igi_visits: [{ ...VISIT, status: 'closed' }],
    igi_visit_lines: [
      { id: 'l1', visit_id: 'v1', model_id: 'm1', qty_requested: 100, qty_issued: 100, qty_received: received },
      { id: 'l2', visit_id: 'v1', model_id: 'm2', qty_requested: 500, qty_issued: 41, qty_received: 41 },
    ],
  })

  it('tells IGI what is missing', async () => {
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const r = await notifyIgiOfShortReturn(db(closed(98)), { visitId: 'v1', siteUrl: 'https://app.test' }, { sendEmail, env: { IGI_EMAILS: '' } })
    expect(r).toEqual({ sent: true, recipients: ['michael@igi.org'], missing: 2 })
    expect(sendEmail.mock.calls[0][0].subject).toBe('V-033 came back short: 2 certificates missing')
  })

  it('sends nothing when everything came back', async () => {
    const sendEmail = jest.fn()
    const r = await notifyIgiOfShortReturn(db(closed(100)), { visitId: 'v1' }, { sendEmail })
    expect(r).toEqual({ sent: false, reason: 'nothing_short', missing: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
