/**
 * The shell every LoveLab email is built in (Sam, 15 sept 2026).
 *
 * The things pinned here are the ones that were actually wrong in the email
 * Sam received: no real document, a logo sized by height on a square file so
 * the wordmark rendered as a speck, and no single type scale.
 */
import { renderEmail, emailButton, hairline, absUrl, BRAND } from '@/lib/email-shell'

describe('renderEmail', () => {
  it('is a complete HTML document, not a bare div', () => {
    const html = renderEmail({ bodyHtml: '<p>Hello</p>', siteUrl: 'https://x.test' })
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('name="viewport"')
    expect(html).toContain('</html>')
    expect(html).toContain('<p>Hello</p>')
  })

  it('sizes the logo by width, so the square file is readable', () => {
    const html = renderEmail({ siteUrl: 'https://x.test' })
    // The email variant: the same wordmark with the square's margin trimmed.
    expect(html).toContain('src="https://x.test/email/logo.png"')
    expect(html).toContain('width="200"')
    // height:48px on a 1024x1024 file is what made the wordmark a speck.
    expect(html).not.toMatch(/height:\s*48px/)
  })

  it('keeps the footer word for word, and never says "LoveLab B2B"', () => {
    const html = renderEmail({ bodyHtml: '<p>x</p>' })
    expect(html).toMatch(/LoveLab\s*&middot;\s*This email was sent automatically\./)
    expect(html).not.toContain('LoveLab B2B')
  })

  it('puts the title in the single heading style, above the body', () => {
    const html = renderEmail({ title: 'New Access Request', bodyHtml: '<p>body</p>' })
    expect(html).toContain('font-size:24px')
    expect(html).toContain(BRAND.plum)
    expect(html.indexOf('New Access Request')).toBeLessThan(html.indexOf('<p>body</p>'))
  })

  it('leaves out the headline row when there is no title', () => {
    expect(renderEmail({ bodyHtml: '<p>x</p>' })).not.toContain('<h1')
  })

  it('hides the preheader from the body but not from the inbox', () => {
    const html = renderEmail({ preheader: 'Two files for you', bodyHtml: '' })
    expect(html).toContain('Two files for you')
    expect(html).toContain('mso-hide:all')
  })

  it('escapes what goes into an attribute', () => {
    const html = renderEmail({ preheader: 'Tom & "Jerry"', siteUrl: 'https://x.test' })
    expect(html).toContain('Tom &amp; &quot;Jerry&quot;')
  })

  it('falls back to an absolute URL when no site is given', () => {
    expect(absUrl('', '/logo.png')).toBe('https://app.lovelab-antwerp.com/logo.png')
    expect(absUrl('https://x.test/', 'logo.png')).toBe('https://x.test/logo.png')
  })
})

describe('emailButton and hairline', () => {
  it('renders a bulletproof button with an escaped href', () => {
    const html = emailButton('https://x.test/a?b=1&c=2', 'Approve')
    expect(html).toContain('href="https://x.test/a?b=1&amp;c=2"')
    expect(html).toContain('Approve')
    expect(html).toContain(BRAND.plum)
    expect(html).toContain('mso-padding-alt')
  })

  it('draws a rule, not a border-bottom on text', () => {
    expect(hairline()).toContain(BRAND.line)
    expect(hairline()).toContain('height:1px')
  })
})

describe('emailButtonPair', () => {
  it('puts the two answers in one row, filled first', () => {
    const { emailButtonPair } = require('@/lib/email-shell')
    const html = emailButtonPair({ href: 'https://x/a', label: 'Approve' }, { href: 'https://x/r', label: 'Reject' })
    expect(html.match(/<tr>/g)).toHaveLength(1)
    expect(html.indexOf('Approve')).toBeLessThan(html.indexOf('Reject'))
    expect(html).toContain(`background:${BRAND.plum}`)
    expect(html).toContain('background:#ffffff')
  })
})
