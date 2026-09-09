/**
 * Centralized email templates for LoveLab.
 * Each function returns an { subject, html } object ready for Resend.
 *
 * Branding note: every user-visible string says "LoveLab" — never "LoveLab
 * B2B". Agents and clients recognise the brand; the "B2B" suffix is internal
 * jargon that confuses non-technical recipients.
 */

const BRAND_COLOR = '#5D3A5E';

function layout(siteUrl, bodyHtml) {
  return `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
      <img src="${siteUrl}/logo.png" alt="LoveLab" style="height: 48px; margin-bottom: 24px;" />
      ${bodyHtml}
      <p style="color: #ccc; font-size: 11px; margin-top: 24px;">
        LoveLab &middot; This email was sent automatically.
      </p>
    </div>
  `;
}

function button(href, label) {
  return `<a href="${href}" style="display: inline-block; padding: 14px 32px; background: ${BRAND_COLOR}; color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">${label}</a>`;
}

export function welcomeAgentEmail(agentName, signInUrl, siteUrl) {
  return {
    subject: `${agentName}, you're invited to LoveLab`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${agentName}!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        You've been invited to join <strong style="color: ${BRAND_COLOR};">LoveLab</strong> as a sales partner.
      </p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Click the button below to sign in — no password needed.
      </p>
      ${button(signInUrl, 'Sign in to LoveLab')}
      <p style="color: #aaa; font-size: 12px; margin-top: 24px;">
        After your first sign-in you can also use Google next time at <a href="${siteUrl}/login" style="color: ${BRAND_COLOR};">${siteUrl.replace('https://', '')}</a>.
      </p>
    `),
  };
}

// Replacement for the magic-link agent invite — sends email + temp password
// directly instead of a single-use OTP that email scanners burn before the
// agent ever clicks it. The agent signs in with these credentials and is
// forced through /set-password on first login (has_password_set: false).
export function welcomeAgentWithPasswordEmail(agentName, email, tempPassword, signInUrl, siteUrl) {
  return {
    subject: `${agentName}, you're invited to LoveLab`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${agentName}!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 16px;">
        You've been invited to join <strong style="color: ${BRAND_COLOR};">LoveLab</strong> as a sales partner.
      </p>
      <p style="color: #555; font-size: 15px; margin: 0 0 12px;">Here are your sign-in details:</p>
      <table style="background: #f7f5f8; border-radius: 8px; padding: 16px 20px; margin: 0 0 24px; font-size: 14px; border-collapse: collapse;">
        <tr>
          <td style="color: #888; padding: 4px 12px 4px 0;">Email</td>
          <td style="color: #1a1a1a; font-family: 'SF Mono', Menlo, monospace; padding: 4px 0;">${email}</td>
        </tr>
        <tr>
          <td style="color: #888; padding: 4px 12px 4px 0;">Password</td>
          <td style="color: #1a1a1a; font-family: 'SF Mono', Menlo, monospace; font-weight: 700; padding: 4px 0;">${tempPassword}</td>
        </tr>
      </table>
      ${button(signInUrl, 'Sign in to LoveLab')}
      <p style="color: #555; font-size: 13px; margin-top: 24px;">
        On your first sign-in you'll be asked to pick your own password.
      </p>
      <p style="color: #aaa; font-size: 12px; margin-top: 16px;">
        If you also have a Google account on this email address, you can use the "Sign in with Google" button at <a href="${siteUrl}/login" style="color: ${BRAND_COLOR};">${siteUrl.replace('https://', '')}</a>.
      </p>
    `),
  };
}

// Commercial assistant invite — same temp-password mechanics as the agent
// invite (magic links are burned by email scanners), but the copy explains
// the assistant role and lists the fairs the admin granted.
export function welcomeAssistantWithPasswordEmail(assistantName, email, tempPassword, signInUrl, siteUrl, fairNames = []) {
  const fairList = (fairNames || []).filter(Boolean);
  const fairsHtml = fairList.length > 0
    ? `<p style="color: #555; font-size: 15px; margin: 0 0 12px;">You have access to the following fairs:</p>
      <ul style="color: #555; font-size: 14px; margin: 0 0 16px; padding-left: 20px;">
        ${fairList.map((n) => `<li style="margin: 2px 0;">${n}</li>`).join('')}
      </ul>`
    : '';
  return {
    subject: `${assistantName}, you're invited to LoveLab`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${assistantName}!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 16px;">
        You've been invited to join <strong style="color: ${BRAND_COLOR};">LoveLab</strong> as a commercial assistant.
      </p>
      ${fairsHtml}
      <p style="color: #555; font-size: 15px; margin: 0 0 12px;">Here are your sign-in details:</p>
      <table style="background: #f7f5f8; border-radius: 8px; padding: 16px 20px; margin: 0 0 24px; font-size: 14px; border-collapse: collapse;">
        <tr>
          <td style="color: #888; padding: 4px 12px 4px 0;">Email</td>
          <td style="color: #1a1a1a; font-family: 'SF Mono', Menlo, monospace; padding: 4px 0;">${email}</td>
        </tr>
        <tr>
          <td style="color: #888; padding: 4px 12px 4px 0;">Password</td>
          <td style="color: #1a1a1a; font-family: 'SF Mono', Menlo, monospace; font-weight: 700; padding: 4px 0;">${tempPassword}</td>
        </tr>
      </table>
      ${button(signInUrl, 'Sign in to LoveLab')}
      <p style="color: #555; font-size: 13px; margin-top: 24px;">
        On your first sign-in you'll be asked to pick your own password.
      </p>
    `),
  };
}

// Existing LoveLab user granted the assistant role — no temp password needed.
export function upgradeAssistantEmail(assistantName, siteUrl, fairNames = []) {
  const fairList = (fairNames || []).filter(Boolean);
  const fairsHtml = fairList.length > 0
    ? `<ul style="color: #555; font-size: 14px; margin: 0 0 24px; padding-left: 20px;">
        ${fairList.map((n) => `<li style="margin: 2px 0;">${n}</li>`).join('')}
      </ul>`
    : '';
  return {
    subject: `${assistantName}, you now have fair access on LoveLab`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Hi ${assistantName},</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 ${fairList.length > 0 ? '12px' : '24px'};">
        You've been added as a <strong style="color: ${BRAND_COLOR};">LoveLab commercial assistant</strong>${fairList.length > 0 ? ' with access to the following fairs:' : '.'}
      </p>
      ${fairsHtml}
      ${button(`${siteUrl}/login`, 'Go to LoveLab')}
    `),
  };
}

export function upgradeAgentEmail(agentName, siteUrl) {
  return {
    subject: `${agentName}, you're now a LoveLab sales partner`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${agentName}!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        You've been added as a <strong style="color: ${BRAND_COLOR};">LoveLab sales partner</strong>. Your orders and commissions will now be tracked automatically.
      </p>
      ${button(`${siteUrl}/login`, 'Go to LoveLab')}
    `),
  };
}

export function restoreAgentEmail(agentName, signInUrl, siteUrl) {
  return {
    subject: `${agentName}, your LoveLab access has been restored`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Your access has been restored</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Hi ${agentName}, your access to <strong style="color: ${BRAND_COLOR};">LoveLab</strong> has been restored. You can now log back in.
      </p>
      ${button(signInUrl, 'Sign in to LoveLab')}
    `),
  };
}

export function orderNotificationEmail({ documentType, clientCompany, clientName, totalAmount, eventName, creatorName }, siteUrl) {
  const isOrder = documentType === 'order';
  const amount = (totalAmount || 0).toLocaleString('fr-FR');
  return {
    subject: isOrder
      ? `New order: ${clientCompany || clientName} — €${amount}`
      : `New quote: ${clientCompany || clientName}`,
    html: layout(siteUrl, `
      <h2 style="color: ${BRAND_COLOR}; margin: 0 0 16px;">
        ${isOrder ? 'New Order Created' : 'New Quote Created'}
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#666;width:140px">Client</td><td style="padding:6px 0;font-weight:600">${clientCompany || clientName || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Contact</td><td style="padding:6px 0">${clientName || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Amount</td><td style="padding:6px 0;font-weight:600;color:${BRAND_COLOR}">€${amount}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Folder</td><td style="padding:6px 0">${eventName || 'No folder'}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Created by</td><td style="padding:6px 0">${creatorName}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Type</td><td style="padding:6px 0;text-transform:capitalize">${documentType}</td></tr>
      </table>
      ${button(`${siteUrl}/dashboard`, 'View in Dashboard')}
    `),
  };
}

export function approvedSignupEmail(fullName, signInUrl, siteUrl) {
  return {
    subject: 'Your LoveLab access has been approved!',
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${fullName}!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Your request to access LoveLab has been <strong style="color: #27ae60;">approved</strong>.
      </p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Click the button below to sign in — no password needed.
      </p>
      ${button(signInUrl, 'Sign in to LoveLab')}
      <p style="color: #aaa; font-size: 12px; margin-top: 24px;">
        This link expires in 24 hours. After signing in you can also use the Magic Link tab on the login page any time.
      </p>
    `),
  };
}

// LoveLab-branded magic link email used by /api/magic-link.
// Replaces Supabase's built-in template so users always see "LoveLab" in
// their inbox instead of "Supabase".
export function magicLinkEmail(displayName, signInUrl, siteUrl) {
  const greeting = displayName && !displayName.includes('@')
    ? `Hi ${displayName},`
    : `Hi,`;
  return {
    subject: 'Sign in to LoveLab',
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">${greeting}</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Click the button below to sign in to <strong style="color: ${BRAND_COLOR};">LoveLab</strong> — no password needed.
      </p>
      ${button(signInUrl, 'Sign in to LoveLab')}
      <p style="color: #aaa; font-size: 12px; margin-top: 24px;">
        This link expires in 1 hour. If you didn't request it, you can safely ignore this email.
      </p>
    `),
  };
}

// LoveLab-branded password recovery email used by /api/forgot-password.
// The reset link routes through /auth/callback?type=recovery&next=/reset-password
// so the user has a real session by the time they pick a new password.
export function resetPasswordEmail(displayName, resetUrl, siteUrl) {
  const greeting = displayName && !displayName.includes('@')
    ? `Hi ${displayName},`
    : `Hi,`;
  return {
    subject: 'Reset your LoveLab password',
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">${greeting}</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Click the button below to choose a new password for your <strong style="color: ${BRAND_COLOR};">LoveLab</strong> account.
      </p>
      ${button(resetUrl, 'Reset password')}
      <p style="color: #aaa; font-size: 12px; margin-top: 24px;">
        This link expires in 1 hour. If you didn't request a reset, ignore this email — your password won't change.
      </p>
    `),
  };
}

// ─── Client-facing order confirmation ───
// Localised subject + body for the email your dad sends to the client
// when a B2B order is finalised. Supports EN / FR / DE / IT / NL.

// Shared LoveLab Google Drive folder containing pack shots, lifestyle photos,
// logos, carousel/wheel assets, etc. Surfaced in every order email so clients
// always have a single canonical source for marketing visuals.
export const LOVELAB_DRIVE_URL = 'https://drive.google.com/drive/folders/16T6-ib-cB53zpftAYn47-sx8FCJuhNhg?usp=sharing'

// Fixed contact card appended to every client order email (regardless of who
// is logged in). Lives here so it's edited in exactly one place if Alberto's
// details ever change.
const SIGNATURE = {
  name: 'Alberto Saleh',
  company: 'THE LOVE GROUP BV',
  email: 'hello@love-lab.com',
  website: 'www.lovelab.be',
  whatsapp: '+32 494 039 945',
}

// Body copy intentionally clarifies that the attachment is the *order
// confirmation*, NOT the final invoice — the invoice goes out later when
// the order is fulfilled. Pre-fix wording said "invoice attached" which
// confused clients into thinking they had been billed already.
const CLIENT_ORDER_LOCALES = {
  en: {
    subject: ({ name }) => `Thank you for your order${name ? `, ${name}` : ''}`,
    greeting: ({ name }) => name ? `Dear ${name},` : `Hello,`,
    body: `Thank you for your order with LoveLab. Please find attached your order confirmation, along with our latest catalogue for your reference. This is not the invoice — the final invoice will follow in the coming weeks.`,
    questions: `If you have any questions, simply reply to this email and we'll be happy to help.`,
    // Used instead of `body` when the catalogue is linked rather than
    // attached, so the email never promises an attachment that isn't there.
    bodyNoCatalogue: `Thank you for your order with LoveLab. Please find attached your order confirmation. This is not the invoice — the final invoice will follow in the coming weeks.`,
    catalogueIntro: `You can download our latest catalogue here:`,
    catalogueLabel: `Download the catalogue`,
    driveIntro: `You can also access all our visual assets (pack shots, lifestyle photos, logo, carousel and wheel) via the link below:`,
    driveLabel: `Open our Google Drive`,
    signoff: `Kind regards,`,
  },
  fr: {
    subject: ({ name }) => `Merci pour votre commande${name ? `, ${name}` : ''}`,
    greeting: ({ name }) => name ? `Cher ${name},` : `Bonjour,`,
    body: `Merci pour votre commande chez LoveLab. Vous trouverez ci-joint la confirmation de votre commande, ainsi que notre dernier catalogue pour référence. Ceci n'est pas la facture — vous recevrez la facture définitive dans les semaines qui viennent.`,
    questions: `Pour toute question, répondez simplement à cet email et nous serons ravis de vous aider.`,
    // Used instead of `body` when the catalogue is linked rather than
    // attached, so the email never promises an attachment that isn't there.
    bodyNoCatalogue: `Merci pour votre commande chez LoveLab. Vous trouverez ci-joint la confirmation de votre commande. Ceci n'est pas la facture — vous recevrez la facture définitive dans les semaines qui viennent.`,
    catalogueIntro: `Vous pouvez télécharger notre dernier catalogue ici :`,
    catalogueLabel: `Télécharger le catalogue`,
    driveIntro: `Vous pouvez également retrouver l'ensemble de nos visuels (pack shots, photos lifestyle, logo, carrousel et roue) via le lien ci-dessous :`,
    driveLabel: `Ouvrir notre Google Drive`,
    signoff: `Bien cordialement,`,
  },
  de: {
    subject: ({ name }) => `Vielen Dank für Ihre Bestellung${name ? `, ${name}` : ''}`,
    greeting: ({ name }) => name ? `Sehr geehrte/r ${name},` : `Guten Tag,`,
    body: `Vielen Dank für Ihre Bestellung bei LoveLab. Anbei finden Sie Ihre Auftragsbestätigung sowie unseren aktuellen Katalog zur Referenz. Dies ist nicht die Rechnung — die endgültige Rechnung folgt in den kommenden Wochen.`,
    questions: `Bei Fragen antworten Sie einfach auf diese E-Mail. Wir helfen Ihnen gerne weiter.`,
    // Used instead of `body` when the catalogue is linked rather than
    // attached, so the email never promises an attachment that isn't there.
    bodyNoCatalogue: `Vielen Dank für Ihre Bestellung bei LoveLab. Anbei finden Sie Ihre Auftragsbestätigung. Dies ist nicht die Rechnung — die endgültige Rechnung folgt in den kommenden Wochen.`,
    catalogueIntro: `Unseren aktuellen Katalog können Sie hier herunterladen:`,
    catalogueLabel: `Katalog herunterladen`,
    driveIntro: `Über den folgenden Link finden Sie zudem unser komplettes Bildmaterial (Packshots, Lifestyle Fotos, Logo, Karussell und Rad):`,
    driveLabel: `Unser Google Drive öffnen`,
    signoff: `Mit freundlichen Grüßen,`,
  },
  it: {
    subject: ({ name }) => `Grazie per il vostro ordine${name ? `, ${name}` : ''}`,
    greeting: ({ name }) => name ? `Gentile ${name},` : `Buongiorno,`,
    body: `Grazie per il vostro ordine con LoveLab. In allegato trovate la conferma del vostro ordine e il nostro ultimo catalogo per riferimento. Questa non è la fattura — la fattura definitiva seguirà nelle prossime settimane.`,
    questions: `Per qualsiasi domanda, rispondete semplicemente a questa email e saremo lieti di aiutarvi.`,
    // Used instead of `body` when the catalogue is linked rather than
    // attached, so the email never promises an attachment that isn't there.
    bodyNoCatalogue: `Grazie per il vostro ordine con LoveLab. In allegato trovate la conferma del vostro ordine. Questa non è la fattura — la fattura definitiva seguirà nelle prossime settimane.`,
    catalogueIntro: `Potete scaricare il nostro ultimo catalogo qui:`,
    catalogueLabel: `Scarica il catalogo`,
    driveIntro: `Potete inoltre accedere a tutti i nostri materiali visivi (pack shot, foto lifestyle, logo, carosello e ruota) tramite il link qui sotto:`,
    driveLabel: `Apri il nostro Google Drive`,
    signoff: `Cordiali saluti,`,
  },
  nl: {
    subject: ({ name }) => `Bedankt voor uw bestelling${name ? `, ${name}` : ''}`,
    greeting: ({ name }) => name ? `Beste ${name},` : `Hallo,`,
    body: `Bedankt voor uw bestelling bij LoveLab. In de bijlage vindt u uw orderbevestiging en onze nieuwste catalogus ter referentie. Dit is niet de factuur — de definitieve factuur volgt in de komende weken.`,
    questions: `Heeft u vragen? Beantwoord deze e-mail en wij helpen u graag verder.`,
    // Used instead of `body` when the catalogue is linked rather than
    // attached, so the email never promises an attachment that isn't there.
    bodyNoCatalogue: `Bedankt voor uw bestelling bij LoveLab. In de bijlage vindt u uw orderbevestiging. Dit is niet de factuur — de definitieve factuur volgt in de komende weken.`,
    catalogueIntro: `U kunt onze nieuwste catalogus hier downloaden:`,
    catalogueLabel: `Download de catalogus`,
    driveIntro: `Via onderstaande link vindt u ook al onze visuals (pack shots, lifestyle foto's, logo, carrousel en wiel):`,
    driveLabel: `Open onze Google Drive`,
    signoff: `Met vriendelijke groet,`,
  },
}

export function getClientOrderLocale(lang) {
  return CLIENT_ORDER_LOCALES[lang] || CLIENT_ORDER_LOCALES.en
}

/**
 * Defensive cleanup for the contact-name string before it reaches the
 * greeting template.
 *
 * The schema separates `client_company` and `client_name`, but in
 * practice users sometimes type the company into the contact field too
 * (e.g. company="Oxygene", contact="Oxygene Marie Schultz"). The greeting
 * then reads "Cher Oxygene Marie Schultz," which is wrong on two counts:
 * the company is not a person, and Marie hasn't agreed to be greeted with
 * her employer's name in the same breath.
 *
 * This helper trims any leading company-name tokens (case-insensitive,
 * with optional comma + whitespace separators) off the contact string.
 * It is conservative: if stripping would leave an empty string, it
 * returns the original input untouched.
 *
 * Examples:
 *   stripCompanyPrefix('Oxygene Marie Schultz', 'Oxygene')       -> 'Marie Schultz'
 *   stripCompanyPrefix('Oxygene, Marie', 'Oxygene')              -> 'Marie'
 *   stripCompanyPrefix('Acme Corp Marie', 'Acme Corp')           -> 'Marie'
 *   stripCompanyPrefix('Marie', 'Oxygene')                       -> 'Marie'  (no prefix to strip)
 *   stripCompanyPrefix('Oxygene', 'Oxygene')                     -> 'Oxygene' (don't reduce to empty)
 */
export function stripCompanyPrefix(contactName, company) {
  if (!contactName) return ''
  const original = String(contactName).trim()
  if (!company) return original
  const tokens = String(company).trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return original
  let result = original
  for (const t of tokens) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Trailing separator OR end-of-string: the final token in a company name
    // that fully consumes the contact (e.g. contact="Acme Corp",
    // company="Acme Corp") has no separator after it, but must still be
    // stripped so the empty-result fallback below returns the original.
    const re = new RegExp(`^${escaped}(?:[,\\s]+|$)`, 'i')
    if (re.test(result)) result = result.replace(re, '').trim()
  }
  return result || original
}

// Convert plain-text edits from the modal into safe HTML paragraphs. We
// preserve line breaks (so multi-paragraph bodies render correctly in Outlook /
// Gmail) and escape the few characters that would otherwise break the HTML
// envelope. Anything more elaborate (lists, links inside the body) the user
// must add by writing literal HTML themselves — we keep the surface tiny.
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function textToHtmlParagraphs(text, style) {
  const safe = escapeHtml(text || '').trim()
  if (!safe) return ''
  return safe
    .split(/\n{2,}/)
    .map(block => `<p style="${style}">${block.replace(/\n/g, '<br />')}</p>`)
    .join('')
}

/**
 * Build the order-confirmation email.
 *
 * `overrides` lets the modal preview surface editable copy without forcing the
 * caller to rebuild the whole template — only the fields the user actually
 * touched are passed in. Everything else falls back to the localised default.
 *
 * The signature block is FIXED across every email (Alberto Saleh / THE LOVE
 * GROUP BV …) regardless of who is logged in and which language the email is
 * in. Edit it via the SIGNATURE constant at the top of this file.
 */
export function clientOrderEmail({
  contactName,
  lang = 'en',
  overrides = {},
  // The catalogue rides along as an attachment only when it fits inside the
  // recipient's mailbox (see lib/orderEmailCatalogue.js). When it doesn't, the
  // order confirmation still goes out and the catalogue becomes a download
  // link — the client always gets the email, which is the part that matters.
  catalogueAttached = true,
  catalogueUrl = '',
}, siteUrl) {
  const L = getClientOrderLocale(lang)
  const displayName = (contactName || '').trim()

  const subject = (overrides.subject || '').trim() || L.subject({ name: displayName })
  const greeting = (overrides.greeting || '').trim() || L.greeting({ name: displayName })
  // Without the attachment the default body must not promise one.
  const defaultBody = catalogueAttached ? L.body : (L.bodyNoCatalogue || L.body)
  const body = (overrides.body || '').trim() || defaultBody
  const questions = (overrides.questions || '').trim() || L.questions
  const signoff = (overrides.signoff || '').trim() || L.signoff
  const driveIntro = (overrides.driveIntro || '').trim() || L.driveIntro
  const driveLabel = (overrides.driveLabel || '').trim() || L.driveLabel
  const driveUrl = (overrides.driveUrl || '').trim() || LOVELAB_DRIVE_URL

  const bodyHtml = textToHtmlParagraphs(body, 'color: #555; font-size: 15px; line-height: 1.55; margin: 0 0 16px;')
  const questionsHtml = questions
    ? `<p style="color: #555; font-size: 14px; line-height: 1.55; margin: 0 0 20px;">${escapeHtml(questions)}</p>`
    : ''

  // We render the Drive link as a small text + button pair so it survives
  // Outlook's selective CSS support without looking like a footer.
  const driveBlock = driveUrl
    ? `
      <p style="color: #555; font-size: 14px; line-height: 1.55; margin: 0 0 10px;">${escapeHtml(driveIntro)}</p>
      <p style="margin: 0 0 24px;">
        <a href="${driveUrl}" style="display: inline-block; padding: 10px 18px; background: ${BRAND_COLOR}; color: #fff; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 600;">${escapeHtml(driveLabel)}</a>
      </p>
    `
    : ''

  // Catalogue download link — only when it could not be attached.
  const catalogueBlock = (!catalogueAttached && catalogueUrl)
    ? `
      <p style="color: #555; font-size: 14px; line-height: 1.55; margin: 0 0 10px;">${escapeHtml(L.catalogueIntro)}</p>
      <p style="margin: 0 0 24px;">
        <a href="${catalogueUrl}" style="display: inline-block; padding: 10px 18px; background: ${BRAND_COLOR}; color: #fff; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 600;">${escapeHtml(L.catalogueLabel)}</a>
      </p>
    `
    : ''

  // Hardcoded Alberto signature card — same for every send. Plain text style
  // so it renders identically in Gmail, Outlook, and Apple Mail.
  const signatureBlock = `
    <p style="color: #1a1a1a; font-size: 15px; font-weight: 700; margin: 0 0 2px;">${escapeHtml(SIGNATURE.name)}</p>
    <p style="color: #1a1a1a; font-size: 14px; font-weight: 600; margin: 0 0 4px;">${escapeHtml(SIGNATURE.company)}</p>
    <p style="color: #555; font-size: 13px; margin: 0 0 2px;">
      <a href="mailto:${SIGNATURE.email}" style="color: ${BRAND_COLOR}; text-decoration: none;">${escapeHtml(SIGNATURE.email)}</a>
      &nbsp;|&nbsp;
      <a href="https://${SIGNATURE.website}" style="color: ${BRAND_COLOR}; text-decoration: none;">${escapeHtml(SIGNATURE.website)}</a>
    </p>
    <p style="color: #555; font-size: 13px; margin: 0;">WhatsApp: ${escapeHtml(SIGNATURE.whatsapp)}</p>
  `

  return {
    subject,
    html: layout(siteUrl, `
      <p style="color: #1a1a1a; font-size: 15px; margin: 0 0 16px;">${escapeHtml(greeting)}</p>
      ${bodyHtml}
      ${questionsHtml}
      ${catalogueBlock}
      ${driveBlock}
      <p style="color: #1a1a1a; font-size: 15px; margin: 0 0 12px;">${escapeHtml(signoff)}</p>
      ${signatureBlock}
    `),
  }
}

export function orgInvitationEmail(orgName, siteUrl) {
  return {
    subject: `You're invited to join ${orgName} on LoveLab`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">You're invited!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        You've been invited to join <strong style="color: ${BRAND_COLOR};">${orgName}</strong> on LoveLab as a sales partner.
      </p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Sign in or create your account to get started.
      </p>
      ${button(`${siteUrl}/login`, 'Sign in to LoveLab')}
    `),
  };
}

// ─── Client-facing resources/documents email ───
// Localised template for emailing catalogues / packs / price lists out of the
// admin dashboard. Mirrors the order-confirmation template's pattern: each
// locale exposes builder functions so the modal can pre-fill editable defaults
// per language, and we end every email with the shared SIGNATURE block so the
// client always gets Alberto's full contact card.
const CLIENT_RESOURCES_LOCALES = {
  en: {
    subject: ({ name }) => name ? `Documents for you, ${name}` : `Documents from LoveLab`,
    greeting: ({ name }) => name ? `Dear ${name},` : `Hello,`,
    body: `Please find attached the documents you requested. Don't hesitate to reach out if you have any questions or need anything else.`,
    filesLabel: `Attached files:`,
    signoff: `Kind regards,`,
  },
  fr: {
    subject: ({ name }) => name ? `Documents pour vous, ${name}` : `Documents de LoveLab`,
    greeting: ({ name }) => name ? `Cher ${name},` : `Bonjour,`,
    body: `Veuillez trouver ci-joint les documents demandés. N'hésitez pas à revenir vers nous pour toute question ou besoin complémentaire.`,
    filesLabel: `Fichiers joints :`,
    signoff: `Bien cordialement,`,
  },
  de: {
    subject: ({ name }) => name ? `Dokumente für Sie, ${name}` : `Dokumente von LoveLab`,
    greeting: ({ name }) => name ? `Sehr geehrte/r ${name},` : `Guten Tag,`,
    body: `Anbei finden Sie die angeforderten Dokumente. Bei Fragen oder weiterem Bedarf können Sie sich gerne jederzeit an uns wenden.`,
    filesLabel: `Angehängte Dateien:`,
    signoff: `Mit freundlichen Grüßen,`,
  },
  it: {
    subject: ({ name }) => name ? `Documenti per voi, ${name}` : `Documenti da LoveLab`,
    greeting: ({ name }) => name ? `Gentile ${name},` : `Buongiorno,`,
    body: `In allegato i documenti richiesti. Non esitate a contattarci per qualsiasi domanda o ulteriore necessità.`,
    filesLabel: `File allegati:`,
    signoff: `Cordiali saluti,`,
  },
  nl: {
    subject: ({ name }) => name ? `Documenten voor u, ${name}` : `Documenten van LoveLab`,
    greeting: ({ name }) => name ? `Beste ${name},` : `Hallo,`,
    body: `In de bijlage vindt u de gevraagde documenten. Aarzel niet om contact met ons op te nemen bij vragen of als u iets anders nodig heeft.`,
    filesLabel: `Bijgevoegde bestanden:`,
    signoff: `Met vriendelijke groet,`,
  },
}

export function getClientResourcesLocale(lang) {
  return CLIENT_RESOURCES_LOCALES[lang] || CLIENT_RESOURCES_LOCALES.en
}

/**
 * Build the client resources email.
 *
 * Same shape and `overrides` mechanism as `clientOrderEmail`: the admin can
 * tweak any of `subject`, `greeting`, `body`, `signoff` from the modal preview
 * and we send exactly what they see. Untouched fields fall back to the
 * localised defaults from CLIENT_RESOURCES_LOCALES.
 *
 * The Alberto signature block is FIXED — same as the order email — so every
 * outbound LoveLab message ends with one canonical contact card.
 *
 * @param {object} params
 * @param {string} [params.contactName] - Recipient name for the greeting.
 * @param {string} [params.lang] - Locale code (en/fr/it/de/nl). Falls back to en.
 * @param {string[]} [params.fileNames] - Names of files attached to the email.
 * @param {object} [params.overrides] - Per-field copy overrides from the modal.
 * @param {string} siteUrl - Base URL used by the shared layout for the logo.
 */
export function clientResourcesEmail({
  contactName,
  lang = 'en',
  fileNames,
  overrides = {},
}, siteUrl) {
  const L = getClientResourcesLocale(lang)
  const displayName = (contactName || '').trim()

  const subject = (overrides.subject || '').trim() || L.subject({ name: displayName })
  const greeting = (overrides.greeting || '').trim() || L.greeting({ name: displayName })
  const body = (overrides.body || '').trim() || L.body
  const signoff = (overrides.signoff || '').trim() || L.signoff

  const bodyHtml = textToHtmlParagraphs(body, 'color: #555; font-size: 15px; line-height: 1.55; margin: 0 0 16px;')

  const filesList = Array.isArray(fileNames) && fileNames.length > 0
    ? `
      <p style="color: #1a1a1a; font-size: 14px; margin: 0 0 6px; font-weight: 600;">${escapeHtml(L.filesLabel)}</p>
      <ul style="color: #555; font-size: 14px; margin: 0 0 24px; padding-left: 20px;">
        ${fileNames.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}
      </ul>
    `
    : ''

  // Same Alberto signature block used by the order email — kept identical so
  // both flows produce a consistent contact card.
  const signatureBlock = `
    <p style="color: #1a1a1a; font-size: 15px; font-weight: 700; margin: 0 0 2px;">${escapeHtml(SIGNATURE.name)}</p>
    <p style="color: #1a1a1a; font-size: 14px; font-weight: 600; margin: 0 0 4px;">${escapeHtml(SIGNATURE.company)}</p>
    <p style="color: #555; font-size: 13px; margin: 0 0 2px;">
      <a href="mailto:${SIGNATURE.email}" style="color: ${BRAND_COLOR}; text-decoration: none;">${escapeHtml(SIGNATURE.email)}</a>
      &nbsp;|&nbsp;
      <a href="https://${SIGNATURE.website}" style="color: ${BRAND_COLOR}; text-decoration: none;">${escapeHtml(SIGNATURE.website)}</a>
    </p>
    <p style="color: #555; font-size: 13px; margin: 0;">WhatsApp: ${escapeHtml(SIGNATURE.whatsapp)}</p>
  `

  return {
    subject,
    html: layout(siteUrl, `
      <p style="color: #1a1a1a; font-size: 15px; margin: 0 0 16px;">${escapeHtml(greeting)}</p>
      ${bodyHtml}
      ${filesList}
      <p style="color: #1a1a1a; font-size: 15px; margin: 24px 0 12px;">${escapeHtml(signoff)}</p>
      ${signatureBlock}
    `),
  }
}
