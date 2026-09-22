/**
 * @jest-environment node
 *
 * /api/price-lists/announce/* — admin-only, validated, one email per agent
 * in the agent's language with the PDF attached, nothing sent in the wrong
 * language, nothing sent when the PDF cannot be fetched.
 */

const mockAuth = jest.fn()
jest.mock('@/lib/fair-assistant/server', () => ({
  requireFairAdmin: (...a) => mockAuth(...a),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))

const mockSendEmail = jest.fn()
jest.mock('@/lib/send-email', () => ({ sendEmail: (...a) => mockSendEmail(...a) }))

const mockRecordSend = jest.fn()
jest.mock('@/lib/emailDeliveries', () => ({ recordSend: (...a) => mockRecordSend(...a) }))

const mockHealth = jest.fn().mockResolvedValue({})
jest.mock('@/lib/healthEvent', () => ({ recordHealthEvent: (...a) => mockHealth(...a) }))

const mockLoad = jest.fn()
jest.mock('@/lib/priceListRecipients', () => {
  const actual = jest.requireActual('@/lib/priceListRecipients')
  return { ...actual, loadAnnouncementRecipients: (...a) => mockLoad(...a) }
})

const mockTranslate = jest.fn()
jest.mock('@/lib/ai/translateText', () => ({ translateText: (...a) => mockTranslate(...a) }))

const { POST: SEND } = require('../price-lists/announce/send/route')
const { POST: TRANSLATE } = require('../price-lists/announce/translate/route')
const { GET: RECIPIENTS } = require('../price-lists/announce/recipients/route')

const { NextResponse } = require('next/server')

function req(body, url = 'http://localhost/api/price-lists/announce/send') {
  return { url, json: jest.fn().mockResolvedValue(body), headers: new Map() }
}

const ADMIN = { user: { id: 'admin-1', email: 'sam@love-lab.com' }, supabase: {}, adminSupabase: { tag: 'admin' } }

const AGENTS = [
  { id: 'a-it', email: 'anna@x.com', full_name: 'Anna Rossi', agent_status: 'active', agent_country: 'Italy', agent_language: null },
  { id: 'a-nl', email: 'bart@x.com', full_name: 'Bart', agent_status: 'paused', agent_country: 'Belgium', agent_language: 'nl' },
  { id: 'a-en', email: 'carl@x.com', full_name: 'Carl', agent_status: 'active', agent_country: null, agent_language: null },
  { id: 'a-nomail', email: null, full_name: 'No Mail', agent_status: 'active', agent_country: 'France', agent_language: null },
]

const GOOD = {
  filePath: '/Price Lists/Pricelist_LoveLab_2026_October.pdf',
  collectionIds: ['CUTY', 'CUBIX'],
  notes: { en: 'Prices up 5%.', it: 'Prezzi +5%.', nl: 'Prijzen +5%.' },
  recipientIds: ['a-it', 'a-nl', 'a-en'],
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://app.lovelab-antwerp.com'
  mockAuth.mockResolvedValue(ADMIN)
  mockLoad.mockResolvedValue(AGENTS)
  mockSendEmail.mockReset().mockResolvedValue({ sent: true, message_id: 'msg-1' })
  mockRecordSend.mockReset().mockResolvedValue({})
  mockHealth.mockClear()
  global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4 fake').buffer })
})

describe('POST /api/price-lists/announce/send', () => {
  test('non-admin is refused before anything is read', async () => {
    mockAuth.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const res = await SEND(req(GOOD))
    expect(res.status).toBe(403)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  test('rejects a path that is not a known price list', async () => {
    const res = await SEND(req({ ...GOOD, filePath: '/Price Lists/../../etc/passwd.pdf' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/price list/i)
  })

  test('rejects no collections and unknown collections', async () => {
    expect((await SEND(req({ ...GOOD, collectionIds: [] }))).status).toBe(400)
    expect((await SEND(req({ ...GOOD, collectionIds: ['CUTY', 'NOPE'] }))).status).toBe(400)
  })

  test('all collections needs no ids', async () => {
    const res = await SEND(req({ ...GOOD, collectionIds: [], allCollections: true }))
    expect(res.status).toBe(200)
    const html = mockSendEmail.mock.calls[0][0].html
    expect(html).toContain('Tutte le collezioni')
  })

  test('rejects when no note is given, or a note is too long', async () => {
    expect((await SEND(req({ ...GOOD, notes: {} }))).status).toBe(400)
    expect((await SEND(req({ ...GOOD, notes: { en: 'x'.repeat(2001) } }))).status).toBe(400)
  })

  test('the English text is required, because every agent gets it as a second version', async () => {
    const res = await SEND(req({ ...GOOD, notes: { it: 'Prezzi +5%.', nl: 'Prijzen +5%.' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/English/)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  test('PDF that cannot be fetched fails the whole call before any send', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 })
    const res = await SEND(req(GOOD))
    expect(res.status).toBe(502)
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledWith('https://app.lovelab-antwerp.com/Price%20Lists/Pricelist_LoveLab_2026_October.pdf')
  })

  test('happy path: one email per agent, in their language, with the PDF attached and tracked', async () => {
    const res = await SEND(req(GOOD))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({ ok: true, sent: 3, failed: 0, skipped: 0, remaining: [] })
    expect(mockSendEmail).toHaveBeenCalledTimes(3)

    const byTo = Object.fromEntries(mockSendEmail.mock.calls.map(([args]) => [args.to, args]))
    expect(byTo['anna@x.com'].subject).toBe('Nuovo listino prezzi LoveLab — CUTY, CUBIX')
    expect(byTo['anna@x.com'].html).toContain('Gentile Anna,')
    expect(byTo['anna@x.com'].html).toContain('Prezzi +5%.')
    expect(byTo['anna@x.com'].html).toContain('English version')
    expect(byTo['anna@x.com'].html).toContain('Prices up 5%.')
    expect(byTo['carl@x.com'].html).not.toContain('English version')
    expect(byTo['bart@x.com'].subject).toMatch(/^Nieuwe LoveLab-prijslijst/)
    expect(byTo['bart@x.com'].html).toContain('Prijzen +5%.')
    expect(byTo['carl@x.com'].subject).toMatch(/^New LoveLab price list/)
    for (const args of Object.values(byTo)) {
      expect(args.replyTo).toBe('alberto@love-lab.com')
      expect(args.attachments).toEqual([{ filename: 'Pricelist_LoveLab_2026_October.pdf', content: expect.any(String) }])
    }

    expect(mockRecordSend).toHaveBeenCalledTimes(3)
    expect(mockRecordSend.mock.calls[0][1]).toMatchObject({ resendId: 'msg-1', kind: 'price_list_announcement' })
    expect(data.results.map((r) => r.status)).toEqual(['sent', 'sent', 'sent'])
    expect(mockHealth).toHaveBeenCalledWith(expect.objectContaining({ source: 'price_list_announcement', severity: 'info' }))
  })

  test('an agent whose language has no note is skipped, never sent English', async () => {
    const res = await SEND(req({ ...GOOD, notes: { en: 'Prices up 5%.', nl: 'Prijzen +5%.' } }))
    const data = await res.json()
    expect(data.sent).toBe(2)
    expect(data.skipped).toBe(1)
    expect(data.results.find((r) => r.id === 'a-it')).toMatchObject({ status: 'skipped', reason: 'no_note_for_language', lang: 'it' })
    expect(mockSendEmail.mock.calls.map(([a]) => a.to).sort()).toEqual(['bart@x.com', 'carl@x.com'])
  })

  test('ids that are not eligible, or have no email, are skipped', async () => {
    const res = await SEND(req({ ...GOOD, recipientIds: ['a-it', 'ghost', 'a-nomail'] }))
    const data = await res.json()
    expect(data.sent).toBe(1)
    expect(data.results.find((r) => r.id === 'ghost')).toMatchObject({ status: 'skipped', reason: 'not_eligible' })
    expect(data.results.find((r) => r.id === 'a-nomail')).toMatchObject({ status: 'skipped', reason: 'no_email' })
  })

  test('a Resend failure is reported per agent and the summary is a warning', async () => {
    mockSendEmail.mockImplementation(async ({ to }) => (to === 'bart@x.com' ? { sent: false, reason: 'resend_error', status: 429 } : { sent: true, message_id: 'ok' }))
    const data = await (await SEND(req(GOOD))).json()
    expect(data).toMatchObject({ sent: 2, failed: 1 })
    expect(data.results.find((r) => r.id === 'a-nl')).toMatchObject({ status: 'failed', reason: 'resend_error', detail: 'HTTP 429' })
    expect(mockRecordSend).toHaveBeenCalledTimes(2)
    expect(mockHealth).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }))
  })

  test('test copy goes only to the caller, tagged, in the chosen language', async () => {
    const res = await SEND(req({ ...GOOD, recipientIds: [], testToSelf: true, testLang: 'it' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, test: true, to: 'sam@love-lab.com', lang: 'it' })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({ to: 'sam@love-lab.com', subject: '[TEST] Nuovo listino prezzi LoveLab — CUTY, CUBIX' })
    expect(mockRecordSend).not.toHaveBeenCalled()
  })

  test('test copy to any other address is refused', async () => {
    const res = await SEND(req({ ...GOOD, testTo: 'someone@else.com' }))
    expect(res.status).toBe(400)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  test('no email service configured is a 503', async () => {
    delete process.env.RESEND_API_KEY
    expect((await SEND(req(GOOD))).status).toBe(503)
  })
})

describe('POST /api/price-lists/announce/translate', () => {
  test('validates note and languages', async () => {
    const url = 'http://localhost/api/price-lists/announce/translate'
    expect((await TRANSLATE(req({ note: '', sourceLang: 'en', targetLang: 'fr' }, url))).status).toBe(400)
    expect((await TRANSLATE(req({ note: 'x', sourceLang: 'xx', targetLang: 'fr' }, url))).status).toBe(400)
    expect((await TRANSLATE(req({ note: 'x', sourceLang: 'en', targetLang: 'es' }, url))).status).toBe(400)
    expect(mockTranslate).not.toHaveBeenCalled()
  })

  test('returns the translation with the collections as context', async () => {
    mockTranslate.mockResolvedValue({ ok: true, text: 'Prix +5 %.', verified: true })
    const res = await TRANSLATE(req({ note: 'Prices up 5%.', sourceLang: 'en', targetLang: 'fr', collectionIds: ['CUTY'] }, 'http://localhost/x'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ lang: 'fr', text: 'Prix +5 %.', verified: true })
    expect(mockTranslate).toHaveBeenCalledWith(expect.objectContaining({ targetLang: 'fr', context: expect.stringContaining('CUTY') }))
  })

  test('a refused translation is a 422 with the reason', async () => {
    mockTranslate.mockResolvedValue({ ok: false, error: 'Translation to French was refused: text still contains English' })
    const res = await TRANSLATE(req({ note: 'Prices up 5%.', sourceLang: 'en', targetLang: 'fr' }, 'http://localhost/x'))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/refused/)
  })
})

describe('GET /api/price-lists/announce/recipients', () => {
  test('groups eligible agents by language', async () => {
    const res = await RECIPIENTS(req({}, 'http://localhost/api/price-lists/announce/recipients'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.total).toBe(3)
    expect(data.counts).toEqual({ it: 1, nl: 1, en: 1 })
    expect(data.fallbackToEnglish).toBe(1)
    expect(data.missingEmail.map((r) => r.id)).toEqual(['a-nomail'])
  })

  test('non-admin is refused', async () => {
    mockAuth.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await RECIPIENTS(req({}, 'http://localhost/x'))).status).toBe(403)
  })
})
