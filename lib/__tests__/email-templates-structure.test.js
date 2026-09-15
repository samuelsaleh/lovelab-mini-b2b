/**
 * What Sam saw in his inbox on 15 sept 2026, turned into tests.
 *
 * The document-sending email (`clientResourcesEmail`) had no rendering test at
 * all, which is how it drifted: the signature ended up the biggest thing in the
 * message, the attachments were default bullets, and the logo was a speck. The
 * three route copies had drifted further still and were signing off "LoveLab
 * B2B" months after the brand dropped the suffix.
 */
import {
  clientResourcesEmail,
  orderEventEmail,
  signupRequestEmail,
  rejectedSignupEmail,
  backupFailedEmail,
  signatureHtml,
} from '@/lib/email-templates'

const SITE = 'https://app.lovelab-antwerp.com'

/** Every font-size in the HTML, largest first. */
const fontSizes = (html) => [...html.matchAll(/font-size:\s*(\d+)px/g)]
  .map((m) => Number(m[1]))
  .sort((a, b) => b - a)

const ALL = () => [
  clientResourcesEmail({ contactName: 'Claire', fileNames: ['Catalogue 2026.pdf'] }, SITE),
  orderEventEmail({ kind: 'created', documentType: 'order', clientCompany: 'THEATRE O FEES', totalAmount: 4210 }, SITE),
  signupRequestEmail({ fullName: 'Claire Blanc', email: 'c@b.fr', approveUrl: `${SITE}/a`, rejectUrl: `${SITE}/r` }, SITE),
  rejectedSignupEmail('Claire Blanc', SITE),
  backupFailedEmail({ date: '2026-09-15', error: 'no credentials' }, SITE),
]

describe('every automatic email shares one shell', () => {
  it('is a real document with the logo and the exact footer', () => {
    for (const { html } of ALL()) {
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
      expect(html).toContain(`${SITE}/email/logo.png`)
      expect(html).toContain('width="200"')
      expect(html).toMatch(/LoveLab\s*&middot;\s*This email was sent automatically\./)
    }
  })

  it('never says "LoveLab B2B", including in the three ported routes', () => {
    for (const { html, subject } of ALL()) {
      expect(html).not.toContain('LoveLab B2B')
      expect(subject).not.toContain('LoveLab B2B')
    }
  })

  it('lets nothing out-shout the 24px title', () => {
    for (const { html } of ALL()) {
      expect(fontSizes(html)[0]).toBeLessThanOrEqual(24)
    }
    // The ones that carry a headline use exactly that size for it.
    expect(fontSizes(rejectedSignupEmail('Claire', SITE).html)[0]).toBe(24)
  })
})

describe('clientResourcesEmail', () => {
  const render = (over = {}) => clientResourcesEmail({
    contactName: 'Claire',
    fileNames: ['Catalogue 2026.pdf', 'Pricelist.xlsx'],
    ...over,
  }, SITE)

  it('lists the attachments in a bordered card with their file type', () => {
    const { html } = render()
    expect(html).toContain('Catalogue 2026.pdf')
    expect(html).toContain('>PDF<')
    expect(html).toContain('>XLSX<')
    expect(html).not.toContain('<ul')
  })

  it('shows no attachment card when nothing is attached', () => {
    const { html } = render({ fileNames: [] })
    expect(html).not.toContain('PDF')
  })

  it('puts the signature after the rule, and no longer as the headline', () => {
    const { html } = render()
    expect(html.indexOf('Alberto Saleh')).toBeGreaterThan(html.indexOf('Catalogue 2026.pdf'))
    // 14px semibold — not the 24px plum reserved for titles.
    expect(html).toMatch(/font-size:14px;font-weight:600;color:#3b2f3f;">Alberto Saleh</)
    expect(html).not.toMatch(/font-size:24px[^<]*>[^<]*Alberto/)
  })

  it('escapes a file name that carries markup', () => {
    const { html } = render({ fileNames: ['<script>.pdf'] })
    expect(html).toContain('&lt;script&gt;.pdf')
    expect(html).not.toContain('<script>')
  })

  it('follows the client locale', () => {
    expect(render({ lang: 'fr' }).subject).not.toBe(render({ lang: 'en' }).subject)
  })
})

describe('signatureHtml', () => {
  it('gives the links their own colour, so Gmail cannot recolour them', () => {
    const html = signatureHtml()
    expect(html).toContain('mailto:hello@love-lab.com')
    expect((html.match(/color:#5D3A5E;text-decoration:none;/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('the three ported route emails', () => {
  it('signupRequestEmail offers both actions and names the requester', () => {
    const { subject, html } = signupRequestEmail(
      { fullName: 'Claire Blanc', email: 'c@b.fr', approveUrl: `${SITE}/a`, rejectUrl: `${SITE}/r` },
      SITE,
    )
    expect(subject).toBe('Access request: Claire Blanc (c@b.fr)')
    expect(html).toContain(`href="${SITE}/a"`)
    expect(html).toContain(`href="${SITE}/r"`)
    expect(html).toContain('Claire Blanc')
  })

  it('rejectedSignupEmail greets the person and gives them a way back', () => {
    const { subject, html } = rejectedSignupEmail('Claire Blanc', SITE)
    expect(subject).toBe('Your LoveLab access request')
    expect(html).toContain('Hi Claire Blanc,')
    expect(html).toContain('contact the LoveLab team')
  })

  it('backupFailedEmail shows the error, trimmed', () => {
    const { html } = backupFailedEmail({ date: '2026-09-15', error: 'x'.repeat(900) }, SITE)
    expect(html).toContain('2026-09-15')
    expect(html).toContain('x'.repeat(500))
    expect(html).not.toContain('x'.repeat(501))
  })
})
