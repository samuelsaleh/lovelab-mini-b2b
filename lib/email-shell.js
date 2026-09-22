/**
 * The one shell every LoveLab email is built in (Sam, 15 sept 2026).
 *
 * The old `layout()` was a bare <div>: no doctype, no <html>, no table, no
 * charset. Mail clients fill those gaps themselves, which is why the result
 * looked different everywhere and why Gmail recoloured text near links. It
 * also sized the logo by height, and public/logo.png is a 1024×1024 square
 * whose wordmark sits in the middle quarter: at 48px tall the brand rendered
 * about 24×7px, a speck. Sam read that as "the logo is missing". Emails use
 * public/email/logo.png instead — the same wordmark with the square's blank
 * margin trimmed off — so a width of 200 gives 200×55 of actual logo rather
 * than 200×200 of mostly nothing.
 *
 * The mechanics here are the ones already proven in the fair outreach email
 * (lib/fair-assistant/email-shell.js): a real document, a 100% background
 * table, a 600px white card, Outlook's mso guards, and the logo sized by
 * width. What is new is that this one takes a body, so every transactional
 * email can share it.
 *
 * One type scale, so nothing in the body can out-shout the title:
 *   title 24 · body 15/1.7 · secondary 13 · footer 12
 */

export const BRAND = {
  plum: '#5D3A5E',
  plumDark: '#4a2e4b',
  gold: '#C9A665',
  text: '#4F4F4F',
  heading: '#3b2f3f',
  muted: '#8A6A7D',
  line: '#EAE3EC',
  bg: '#FDF7FA',
  card: '#ffffff',
}

export const FONT_BODY = "'Helvetica Neue', Helvetica, Arial, sans-serif"
export const FONT_HEADING = "Georgia, 'Times New Roman', serif"

/** Absolute URL for an email asset; relative paths never load in a mail client. */
export function absUrl(siteUrl, path) {
  const base = String(siteUrl || 'https://app.lovelab-antwerp.com').replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Wrap body HTML in the LoveLab shell.
 *
 * @param {object} o
 * @param {string} o.bodyHtml   the email's own content
 * @param {string} [o.title]    optional serif headline under the logo
 * @param {string} [o.preheader] the grey line shown next to the subject in the
 *                              inbox; hidden inside the email itself
 * @param {string} [o.siteUrl]  base for the logo
 * @returns {string} a complete HTML document
 */
export function renderEmail({ bodyHtml = '', title = '', preheader = '', siteUrl = '' } = {}) {
  const logo = absUrl(siteUrl, '/email/logo.png')

  const preheaderRow = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeAttr(preheader)}</div>`
    : ''

  const titleRow = title
    ? `<tr><td align="center" style="padding:0 40px 8px;">
         <h1 style="margin:0;font-family:${FONT_HEADING};font-size:24px;line-height:1.3;font-weight:400;color:${BRAND.plum};">${title}</h1>
       </td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>LoveLab</title>
<!--[if mso]><style>body,table,td,a{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%;">
${preheaderRow}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:4px;">
        <tr>
          <td align="center" style="padding:36px 40px 0;">
            <img src="${escapeAttr(logo)}" alt="LoveLab" width="200" style="display:block;width:200px;max-width:200px;height:auto;border:0;margin:0 auto;">
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 40px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="width:40px;height:1px;background:${BRAND.gold};font-size:0;line-height:0;">&nbsp;</td>
            </tr></table>
          </td>
        </tr>
        ${titleRow}
        <tr>
          <td style="padding:8px 40px 36px;font-family:${FONT_BODY};font-size:15px;line-height:1.7;color:${BRAND.text};">
${bodyHtml}
          </td>
        </tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td align="center" style="padding:18px 40px 0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${BRAND.muted};">
            LoveLab &middot; This email was sent automatically.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/** A thin rule, for separating the signature from the message. */
export function hairline() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 20px;"><tr><td style="height:1px;background:${BRAND.line};font-size:0;line-height:0;">&nbsp;</td></tr></table>`
}

/** One button, as a table cell — a bare <a> is unclickable in older Outlook. */
function buttonCell(href, label, { primary = true } = {}) {
  const fill = primary
    ? `background:${BRAND.plum};`
    : `background:#ffffff;border:1px solid ${BRAND.line};`
  const ink = primary ? '#ffffff' : BRAND.heading
  return `<td align="center" style="border-radius:28px;${fill}">
      <a href="${escapeAttr(href)}" style="display:inline-block;padding:${primary ? 14 : 13}px 30px;font-family:${FONT_BODY};font-size:15px;font-weight:600;color:${ink};text-decoration:none;border-radius:28px;mso-padding-alt:0;">${label}</a>
    </td>`
}

/** The filled plum button used for the one action an email asks for. */
export function emailButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr>
    ${buttonCell(href, label)}
  </tr></table>`
}

/**
 * Two buttons side by side, for an email that asks a yes-or-no question.
 * Stacked buttons read as two separate asks; these read as one choice.
 */
export function emailButtonPair(primary, secondary) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr>
    ${buttonCell(primary.href, primary.label)}
    <td style="width:12px;font-size:0;line-height:0;">&nbsp;</td>
    ${buttonCell(secondary.href, secondary.label, { primary: false })}
  </tr></table>`
}
