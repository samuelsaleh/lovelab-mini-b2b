/**
 * @jest-environment node
 *
 * /api/resources/send-email — what a non-admin agent may email.
 * Catalogues and brand documents: yes. Price lists, EAN codes, order packs: 403.
 */

jest.mock('@/lib/packTemplates', () => ({
  packTemplateIdFromPath: (p) => {
    const m = /^\/api\/pack-templates\/([^/]+)\/download$/.exec(String(p || ''))
    return m ? m[1] : null
  },
  resolvePackTemplate: jest.fn().mockResolvedValue({ buffer: Buffer.from('x'), fileName: 'pack.xlsx' }),
}))
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn().mockReturnValue({ tag: 'admin' }),
}))
jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'agent-1' }, isAdmin: false }),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))
jest.mock('@/lib/email', () => ({
  getSenderFrom: () => 'LoveLab <hello@love-lab.com>',
  getAdminNotificationRecipients: () => ({ all: [] }),
}))
jest.mock('@/lib/email-templates', () => ({
  clientResourcesEmail: () => ({ subject: 'Your files', html: '<p>hi</p>' }),
}))

const { POST } = require('../resources/send-email/route')

function req(body) {
  return { url: 'http://localhost/api/resources/send-email', json: jest.fn().mockResolvedValue(body), headers: new Map() }
}

let fetchMock
beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://app.lovelab-antwerp.com'
  fetchMock = jest.fn(async (url) => {
    if (url === 'https://api.resend.com/emails') return { ok: true, json: async () => ({ id: 'email-1' }), text: async () => '' }
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode('%PDF').buffer }
  })
  global.fetch = fetchMock
})

describe('POST /api/resources/send-email — agent access', () => {
  it('lets an agent email a catalogue and a brand document', async () => {
    const res = await POST(req({
      to: 'client@example.com',
      files: [
        { name: 'EN', path: '/catalogues/English/Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf' },
        { name: 'DE brand', path: '/BRAND PRESENTATION DOCS/LoveLab_Brand_Presentation_General_DE.pdf' },
      ],
    }))
    expect(res.status).toBe(200)
    const resend = fetchMock.mock.calls.find(([url]) => url === 'https://api.resend.com/emails')
    expect(JSON.parse(resend[1].body).attachments).toHaveLength(2)
  })

  it('refuses a price list, an EAN file and a pack template for an agent', async () => {
    for (const path of [
      '/Price Lists/Pricelist_LoveLab_2026_October.pdf',
      '/Ean Codes/Final-GS1-Code.xlsx',
      '/api/pack-templates/abc/download',
    ]) {
      const res = await POST(req({ to: 'client@example.com', files: [{ name: 'x', path }] }))
      expect(res.status).toBe(403)
    }
    expect(fetchMock.mock.calls.some(([url]) => url === 'https://api.resend.com/emails')).toBe(false)
  })
})
