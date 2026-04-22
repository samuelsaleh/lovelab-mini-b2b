/**
 * Centralized email templates for LoveLab B2B.
 * Each function returns an { subject, html } object ready for Resend.
 */

const BRAND_COLOR = '#5D3A5E';

function layout(siteUrl, bodyHtml) {
  return `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
      <img src="${siteUrl}/logo.png" alt="LoveLab" style="height: 48px; margin-bottom: 24px;" />
      ${bodyHtml}
      <p style="color: #ccc; font-size: 11px; margin-top: 24px;">
        LoveLab B2B &middot; This email was sent automatically.
      </p>
    </div>
  `;
}

function button(href, label) {
  return `<a href="${href}" style="display: inline-block; padding: 14px 32px; background: ${BRAND_COLOR}; color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">${label}</a>`;
}

export function welcomeAgentEmail(agentName, signInUrl, siteUrl) {
  return {
    subject: `${agentName}, you're invited to LoveLab B2B`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${agentName}!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        You've been invited to join <strong style="color: ${BRAND_COLOR};">LoveLab B2B</strong> as a sales partner.
      </p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Click the button below to sign in — no password needed.
      </p>
      ${button(signInUrl, 'Sign in to LoveLab B2B')}
      <p style="color: #aaa; font-size: 12px; margin-top: 24px;">
        After your first sign-in you can also use Google next time at <a href="${siteUrl}/login" style="color: ${BRAND_COLOR};">${siteUrl.replace('https://', '')}</a>.
      </p>
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
      ${button(`${siteUrl}/login`, 'Go to LoveLab B2B')}
    `),
  };
}

export function restoreAgentEmail(agentName, signInUrl, siteUrl) {
  return {
    subject: `${agentName}, your LoveLab B2B access has been restored`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Your access has been restored</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Hi ${agentName}, your access to <strong style="color: ${BRAND_COLOR};">LoveLab B2B</strong> has been restored. You can now log back in.
      </p>
      ${button(signInUrl, 'Sign in to LoveLab B2B')}
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
    subject: 'Your LoveLab B2B access has been approved!',
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${fullName}!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Your request to access LoveLab B2B has been <strong style="color: #27ae60;">approved</strong>.
      </p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Click the button below to sign in — no password needed.
      </p>
      ${button(signInUrl, 'Sign in to LoveLab B2B')}
      <p style="color: #aaa; font-size: 12px; margin-top: 24px;">
        This link expires in 24 hours. After signing in you can also use the Magic Link tab on the login page any time.
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

const CLIENT_ORDER_LOCALES = {
  en: {
    subject: ({ name }) => `Thank you for your order${name ? `, ${name}` : ''}`,
    greeting: ({ name }) => name ? `Dear ${name},` : `Hello,`,
    body: `Thank you for your order with LoveLab. Please find your invoice attached, along with our latest catalogue for your reference.`,
    questions: `If you have any questions, simply reply to this email and we'll be happy to help.`,
    driveIntro: `You can also access all our visual assets (pack shots, lifestyle photos, logo, carousel and wheel) via the link below:`,
    driveLabel: `Open our Google Drive`,
    signoff: `Kind regards,`,
  },
  fr: {
    subject: ({ name }) => `Merci pour votre commande${name ? `, ${name}` : ''}`,
    greeting: ({ name }) => name ? `Cher ${name},` : `Bonjour,`,
    body: `Merci pour votre commande chez LoveLab. Vous trouverez votre facture en pièce jointe, ainsi que notre dernier catalogue pour référence.`,
    questions: `Pour toute question, répondez simplement à cet email et nous serons ravis de vous aider.`,
    driveIntro: `Vous pouvez également retrouver l'ensemble de nos visuels (pack shots, photos lifestyle, logo, carrousel et roue) via le lien ci-dessous :`,
    driveLabel: `Ouvrir notre Google Drive`,
    signoff: `Bien cordialement,`,
  },
  de: {
    subject: ({ name }) => `Vielen Dank für Ihre Bestellung${name ? `, ${name}` : ''}`,
    greeting: ({ name }) => name ? `Sehr geehrte/r ${name},` : `Guten Tag,`,
    body: `Vielen Dank für Ihre Bestellung bei LoveLab. Anbei finden Sie Ihre Rechnung sowie unseren aktuellen Katalog zur Referenz.`,
    questions: `Bei Fragen antworten Sie einfach auf diese E-Mail. Wir helfen Ihnen gerne weiter.`,
    driveIntro: `Über den folgenden Link finden Sie zudem unser komplettes Bildmaterial (Packshots, Lifestyle Fotos, Logo, Karussell und Rad):`,
    driveLabel: `Unser Google Drive öffnen`,
    signoff: `Mit freundlichen Grüßen,`,
  },
  it: {
    subject: ({ name }) => `Grazie per il vostro ordine${name ? `, ${name}` : ''}`,
    greeting: ({ name }) => name ? `Gentile ${name},` : `Buongiorno,`,
    body: `Grazie per il vostro ordine con LoveLab. In allegato trovate la vostra fattura e il nostro ultimo catalogo per riferimento.`,
    questions: `Per qualsiasi domanda, rispondete semplicemente a questa email e saremo lieti di aiutarvi.`,
    driveIntro: `Potete inoltre accedere a tutti i nostri materiali visivi (pack shot, foto lifestyle, logo, carosello e ruota) tramite il link qui sotto:`,
    driveLabel: `Apri il nostro Google Drive`,
    signoff: `Cordiali saluti,`,
  },
  nl: {
    subject: ({ name }) => `Bedankt voor uw bestelling${name ? `, ${name}` : ''}`,
    greeting: ({ name }) => name ? `Beste ${name},` : `Hallo,`,
    body: `Bedankt voor uw bestelling bij LoveLab. In de bijlage vindt u uw factuur en onze nieuwste catalogus ter referentie.`,
    questions: `Heeft u vragen? Beantwoord deze e-mail en wij helpen u graag verder.`,
    driveIntro: `Via onderstaande link vindt u ook al onze visuals (pack shots, lifestyle foto's, logo, carrousel en wiel):`,
    driveLabel: `Open onze Google Drive`,
    signoff: `Met vriendelijke groet,`,
  },
}

export function getClientOrderLocale(lang) {
  return CLIENT_ORDER_LOCALES[lang] || CLIENT_ORDER_LOCALES.en
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
}, siteUrl) {
  const L = getClientOrderLocale(lang)
  const displayName = (contactName || '').trim()

  const subject = (overrides.subject || '').trim() || L.subject({ name: displayName })
  const greeting = (overrides.greeting || '').trim() || L.greeting({ name: displayName })
  const body = (overrides.body || '').trim() || L.body
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
      ${driveBlock}
      <p style="color: #1a1a1a; font-size: 15px; margin: 0 0 12px;">${escapeHtml(signoff)}</p>
      ${signatureBlock}
    `),
  }
}

export function orgInvitationEmail(orgName, siteUrl) {
  return {
    subject: `You're invited to join ${orgName} on LoveLab B2B`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">You're invited!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        You've been invited to join <strong style="color: ${BRAND_COLOR};">${orgName}</strong> on LoveLab B2B as a sales partner.
      </p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Sign in or create your account to get started.
      </p>
      ${button(`${siteUrl}/login`, 'Sign in to LoveLab B2B')}
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
