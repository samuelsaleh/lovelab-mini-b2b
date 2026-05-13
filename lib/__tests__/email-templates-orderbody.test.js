/**
 * @jest-environment node
 *
 * Regression pin for the order-confirmation body copy in all 5 locales.
 *
 * Pre-fix (2026-05-12 and earlier): every locale said "your invoice
 * attached" but the attachment was the order confirmation PDF — the actual
 * invoice goes out later. Clients (and Sam's dad) were confused into
 * thinking they had been billed.
 *
 * Post-fix: every body must (1) say it's an order/order confirmation, NOT
 * an invoice, and (2) tell the client the final invoice will follow.
 *
 * This file pins both contracts so a future refactor can't silently revert
 * to the misleading wording.
 */

const { clientOrderEmail, getClientOrderLocale } = require('../email-templates')

const SITE_URL = 'https://app.lovelab.com'

describe('CLIENT_ORDER_LOCALES — body copy clarifies "order, not invoice"', () => {
  // Per locale: the literal substrings we expect, plus the substrings we
  // refuse to ship (the old invoice-only wording). The "must NOT contain
  // standalone invoice claim" check catches the *exact* old phrasing; the
  // word "facture" / "invoice" / etc. on its own is fine because the new
  // body now mentions both order AND invoice (just in the right context).
  const cases = [
    {
      lang: 'en',
      mustContain: ['order confirmation', 'final invoice will follow'],
      mustNotContain: ['Please find your invoice attached'],
    },
    {
      lang: 'fr',
      mustContain: ['confirmation de votre commande', 'facture définitive'],
      mustNotContain: ['Vous trouverez votre facture en pièce jointe'],
    },
    {
      lang: 'de',
      mustContain: ['Auftragsbestätigung', 'endgültige Rechnung folgt'],
      mustNotContain: ['Anbei finden Sie Ihre Rechnung sowie'],
    },
    {
      lang: 'it',
      mustContain: ['conferma del vostro ordine', 'fattura definitiva'],
      mustNotContain: ['In allegato trovate la vostra fattura e il nostro'],
    },
    {
      lang: 'nl',
      mustContain: ['orderbevestiging', 'definitieve factuur volgt'],
      mustNotContain: ['In de bijlage vindt u uw factuur en'],
    },
  ]

  cases.forEach(({ lang, mustContain, mustNotContain }) => {
    describe(`locale: ${lang}`, () => {
      it('locale exists in CLIENT_ORDER_LOCALES', () => {
        const L = getClientOrderLocale(lang)
        expect(L).toBeTruthy()
        expect(typeof L.body).toBe('string')
      })

      mustContain.forEach((needle) => {
        it(`body contains "${needle}"`, () => {
          const L = getClientOrderLocale(lang)
          expect(L.body).toEqual(expect.stringContaining(needle))
        })
      })

      mustNotContain.forEach((needle) => {
        it(`body does NOT contain old wording "${needle}"`, () => {
          const L = getClientOrderLocale(lang)
          expect(L.body).not.toEqual(expect.stringContaining(needle))
        })
      })

      it('clientOrderEmail() renders the new body into the HTML', () => {
        const { html } = clientOrderEmail({ contactName: 'Marie', lang }, SITE_URL)
        mustContain.forEach((needle) => {
          // HTML escape would only mangle special chars, none of our markers
          // contain any. Plain substring check is enough.
          expect(html).toEqual(expect.stringContaining(needle))
        })
      })
    })
  })
})
