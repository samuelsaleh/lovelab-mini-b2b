/**
 * @jest-environment node
 *
 * The catalogue fallback path.
 *
 * On 6 Sep 2026 an order email carried the 22.6 MB German catalogue. Resend
 * accepted it, the Google-hosted BCCs received it, and the client's iCloud
 * mailbox bounced it for size — so the one person who needed the confirmation
 * got nothing. The catalogue is now attached only when it fits; when it
 * doesn't, the email still goes and the catalogue becomes a link.
 *
 * What must hold: the email never promises an attachment it isn't carrying.
 */

const { clientOrderEmail, getClientOrderLocale } = require('../email-templates')

const SITE_URL = 'https://b2b-lovelab.com'
const CATALOGUE_URL = `${SITE_URL}/catalogues/Oct%20DE_Catalogue.pdf`
const LANGS = ['en', 'fr', 'de', 'it', 'nl']

describe('order email — catalogue attached (the normal path)', () => {
  test.each(LANGS)('%s keeps the wording that mentions the attached catalogue', (lang) => {
    const { html } = clientOrderEmail({ contactName: 'Janina', lang }, SITE_URL)
    const L = getClientOrderLocale(lang)
    expect(html).toContain(escapeForHtml(L.body))
    expect(html).not.toContain(escapeForHtml(L.catalogueLabel))
  })

  test('no catalogue link is rendered even if a URL is passed', () => {
    const { html } = clientOrderEmail(
      { contactName: 'Janina', lang: 'de', catalogueAttached: true, catalogueUrl: CATALOGUE_URL },
      SITE_URL,
    )
    expect(html).not.toContain(CATALOGUE_URL)
  })
})

describe('order email — catalogue too big to attach', () => {
  test.each(LANGS)('%s swaps in body copy that promises no attachment', (lang) => {
    const { html } = clientOrderEmail(
      { contactName: 'Janina', lang, catalogueAttached: false, catalogueUrl: CATALOGUE_URL },
      SITE_URL,
    )
    const L = getClientOrderLocale(lang)
    expect(html).toContain(escapeForHtml(L.bodyNoCatalogue))
    expect(html).not.toContain(escapeForHtml(L.body))
  })

  test.each(LANGS)('%s renders a download button pointing at the catalogue', (lang) => {
    const { html } = clientOrderEmail(
      { contactName: 'Janina', lang, catalogueAttached: false, catalogueUrl: CATALOGUE_URL },
      SITE_URL,
    )
    const L = getClientOrderLocale(lang)
    expect(html).toContain(`href="${CATALOGUE_URL}"`)
    expect(html).toContain(escapeForHtml(L.catalogueLabel))
    expect(html).toContain(escapeForHtml(L.catalogueIntro))
  })

  test.each(LANGS)('%s still says it is an order, not an invoice', (lang) => {
    // The contract pinned by email-templates-orderbody.test.js must survive
    // in the fallback copy too.
    const L = getClientOrderLocale(lang)
    expect(L.bodyNoCatalogue).toBeTruthy()
    expect(L.bodyNoCatalogue.toLowerCase()).not.toContain('catalog')
    expect(L.bodyNoCatalogue.toLowerCase()).not.toContain('katalog')
  })

  test('the Google Drive block is untouched by the catalogue fallback', () => {
    const withCat = clientOrderEmail({ contactName: 'J', lang: 'de' }, SITE_URL).html
    const without = clientOrderEmail(
      { contactName: 'J', lang: 'de', catalogueAttached: false, catalogueUrl: CATALOGUE_URL },
      SITE_URL,
    ).html
    const L = getClientOrderLocale('de')
    expect(withCat).toContain(escapeForHtml(L.driveLabel))
    expect(without).toContain(escapeForHtml(L.driveLabel))
  })

  test('a missing URL degrades to no block rather than a dead link', () => {
    const { html } = clientOrderEmail(
      { contactName: 'J', lang: 'de', catalogueAttached: false, catalogueUrl: '' },
      SITE_URL,
    )
    const L = getClientOrderLocale('de')
    expect(html).not.toContain(escapeForHtml(L.catalogueLabel))
    // The body still avoids claiming an attachment.
    expect(html).toContain(escapeForHtml(L.bodyNoCatalogue))
  })

  test('an admin body override still wins over the fallback copy', () => {
    const { html } = clientOrderEmail(
      {
        contactName: 'J', lang: 'de',
        catalogueAttached: false, catalogueUrl: CATALOGUE_URL,
        overrides: { body: 'Custom body from the admin.' },
      },
      SITE_URL,
    )
    expect(html).toContain('Custom body from the admin.')
    expect(html).toContain(`href="${CATALOGUE_URL}"`)
  })
})

// The template HTML-escapes copy before interpolating it.
function escapeForHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
