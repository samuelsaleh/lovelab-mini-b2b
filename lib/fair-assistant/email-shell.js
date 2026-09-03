import { getFairEmailProducts } from '@/lib/fair-assistant/email-products';

const BRAND = {
  plum: '#5D3A5E',
  plumDark: '#4a2e4b',
  muted: '#8A6A7D',
  text: '#4F4F4F',
  textLight: '#666',
  bg: '#FDF7FA',
  border: '#E8E8E8',
  gold: '#C9A665',
};

// Default CTA targets — each batch can override label + URL per button.
const DEFAULT_BUTTON1 = { label: 'Visit Our Website', url: 'https://lovelab.be/' };
const DEFAULT_BUTTON2 = { label: 'B2B Login',         url: 'https://lovelab.be/b2b-signup' };

function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(text) {
  return esc(text).replace(/\n/g, '<br>');
}

function productGridHtml(products) {
  const rows = [];
  for (let i = 0; i < products.length; i += 2) {
    const left = products[i];
    const right = products[i + 1];
    rows.push(`
      <tr>
        ${productCell(left)}
        ${right ? productCell(right) : '<td style="width:50%;"></td>'}
      </tr>
    `);
  }
  return rows.join('');
}

function productCell(product) {
  if (!product) return '';
  const img = product.imageUrl
    ? `<img src="${esc(product.imageUrl)}" alt="${esc(product.label)}" width="200" height="200" style="display:block;width:200px;height:200px;object-fit:contain;margin:0 auto 15px auto;">`
    : '';
  return `
    <td style="width:50%;border:1px solid ${BRAND.border};text-align:center;vertical-align:top;padding:25px 15px;">
      <a href="${esc(product.href)}" target="_blank" style="text-decoration:none;display:block;">
        ${img}
        <p style="margin:0;font-size:12px;font-weight:500;color:${BRAND.plum};text-transform:uppercase;letter-spacing:0.1em;text-decoration:underline;">
          ${esc(product.label)}
        </p>
      </a>
    </td>
  `;
}

function ctaButtonsHtml(b1, b2) {
  // Skip the entire row if both buttons have been cleared by the user.
  if (!b1?.url && !b2?.url) return '';
  const filled = (btn) => `
    <td style="padding:6px;">
      <a href="${esc(btn.url)}" target="_blank" style="display:inline-block;padding:14px 28px;background-color:${BRAND.plum};color:#ffffff;text-decoration:none;border-radius:28px;font-size:14px;font-weight:600;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:0.02em;mso-padding-alt:0;">
        ${esc(btn.label)}
      </a>
    </td>`;
  const outline = (btn) => `
    <td style="padding:6px;">
      <a href="${esc(btn.url)}" target="_blank" style="display:inline-block;padding:13px 28px;background-color:#ffffff;color:${BRAND.plum};text-decoration:none;border:1px solid ${BRAND.plum};border-radius:28px;font-size:14px;font-weight:600;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:0.02em;mso-padding-alt:0;">
        ${esc(btn.label)}
      </a>
    </td>`;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 24px auto;">
      <tr>
        ${b1?.url ? filled(b1) : ''}
        ${b2?.url ? outline(b2) : ''}
      </tr>
    </table>
  `;
}

function contactCardHtml() {
  const line = (txt) => `<p style="margin:6px 0;font-size:14px;color:${BRAND.text};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${esc(txt)}</p>`;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:0 30px;">
          <table role="presentation" width="100%" align="center" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#ffffff;border:1px solid ${BRAND.border};border-radius:12px;margin:0 auto;">
            <tr>
              <td align="center" style="padding:24px 30px;">
                <p style="margin:0 0 14px 0;font-size:11px;color:${BRAND.gold};text-transform:uppercase;letter-spacing:0.2em;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Contact</p>
                ${line('hello@love-lab.com')}
                ${line('+32 475 32 10 32')}
                ${line('lovelab.be')}
                ${line('@lovelab_official')}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Render branded LoveLab fair outreach HTML.
 *
 * Layout (matches the in-app "Thank You for Visiting Us" preview):
 *   Logo → gold divider → headline → fair-name subtitle (gold uppercase)
 *   → greeting → paragraph 1 → CTA buttons (Visit Our Website / B2B Login)
 *   → paragraph 2 → optional ctaLine → signoff → divider
 *   → "EXPLORE OUR COLLECTIONS" → product grid → benefit pills
 *   → contact card → footer tagline.
 */
export function renderFairOutreachEmail({
  siteUrl,
  logoUrl,
  greeting,
  headline,
  fairName,
  paragraph1,
  paragraph2,
  signoff,
  ctaLine,
  products,
  button1,
  button2,
  customHtml,
}) {
  const gridProducts = products || getFairEmailProducts(siteUrl);
  const logo = logoUrl || absUrl(siteUrl, '/logo.png');
  const showCtaLine = ctaLine && !/lovelab\.be/i.test(ctaLine);
  // Hide the gold subtitle if the headline already names the fair —
  // otherwise "Great meeting you at Sam test" + "SAM TEST" duplicates.
  const headlineLower = String(headline || '').toLowerCase();
  const fairLower = String(fairName || '').toLowerCase().trim();
  const showFairSubtitle = !!fairLower && !headlineLower.includes(fairLower);
  const b1 = (button1?.url || button1?.label) ? button1 : DEFAULT_BUTTON1;
  const b2 = (button2?.url || button2?.label) ? button2 : DEFAULT_BUTTON2;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LoveLab</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;max-width:600px;">
          <tr>
            <td align="center" style="padding:30px 50px 16px 50px;">
              <img src="${esc(logo)}" alt="LOVELAB" width="220" style="display:block;max-width:220px;height:auto;margin:0 auto;">
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 50px 6px 50px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr><td style="width:40px;height:1px;background-color:${BRAND.gold};"></td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:6px 50px 0 50px;">
              ${headline ? `<h1 style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:400;color:${BRAND.plum};line-height:1.3;text-align:center;">${esc(headline)}</h1>` : ''}
              ${showFairSubtitle ? `<p style="margin:0 0 22px 0;font-size:11px;color:${BRAND.gold};text-transform:uppercase;letter-spacing:0.2em;font-weight:700;text-align:center;">${esc(fairName)}</p>` : ''}
            </td>
          </tr>
          ${customHtml && customHtml.trim() ? `
          <tr>
            <td style="padding:0 50px 0 50px;color:${BRAND.text};font-size:15px;line-height:1.7;">
              <p style="margin:0 0 15px 0;font-size:15px;line-height:1.7;color:${BRAND.text};text-align:left;">${nl2br(greeting)}</p>
              <div style="font-size:15px;line-height:1.7;color:${BRAND.text};text-align:left;">${customHtml}</div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 50px;">
              ${ctaButtonsHtml(b1, b2)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 50px 0 50px;">
              ${signoff ? `<p style="margin:18px 0 24px 0;font-size:14px;line-height:1.7;color:${BRAND.text};text-align:left;">${nl2br(signoff)}</p>` : ''}
            </td>
          </tr>
          ` : `
          <tr>
            <td style="padding:0 50px 0 50px;">
              <p style="margin:0 0 15px 0;font-size:15px;line-height:1.7;color:${BRAND.text};text-align:left;">${nl2br(greeting)}</p>
              ${paragraph1 ? `<p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:${BRAND.text};text-align:left;">${nl2br(paragraph1)}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 50px;">
              ${ctaButtonsHtml(b1, b2)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 50px 0 50px;">
              ${paragraph2 ? `<p style="margin:0 0 15px 0;font-size:15px;line-height:1.7;color:${BRAND.text};text-align:left;">${nl2br(paragraph2)}</p>` : ''}
              ${showCtaLine ? `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.7;color:${BRAND.muted};text-align:left;font-style:italic;">${nl2br(ctaLine)}</p>` : ''}
              ${signoff ? `<p style="margin:18px 0 24px 0;font-size:14px;line-height:1.7;color:${BRAND.text};text-align:left;">${nl2br(signoff)}</p>` : ''}
            </td>
          </tr>
          `}
          <tr>
            <td style="padding:0 50px;"><table role="presentation" width="100%"><tr><td style="height:1px;background-color:#E3E3E3;"></td></tr></table></td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 50px 8px 50px;">
              <h2 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400;color:${BRAND.plum};letter-spacing:0.05em;">EXPLORE OUR COLLECTIONS</h2>
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 30px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;">
                ${productGridHtml(gridProducts)}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 16px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" width="50%" style="padding:10px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.border};border-radius:20px;width:100%;">
                      <tr><td align="center" style="padding:10px 5px;"><p style="margin:0;font-size:10px;color:${BRAND.textLight};">14 days return</p></td></tr>
                    </table>
                  </td>
                  <td align="center" width="50%" style="padding:10px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.border};border-radius:20px;width:100%;">
                      <tr><td align="center" style="padding:10px 5px;"><p style="margin:0;font-size:10px;color:${BRAND.textLight};">Worldwide shipping</p></td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0 28px 0;">
              ${contactCardHtml()}
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 36px 40px;">
              <p style="margin:0;font-size:12px;color:${BRAND.muted};text-align:center;">Love Group BV · Antwerp, Belgium</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function absUrl(siteUrl, path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const base = (siteUrl || 'https://lovelab.be').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function fillTemplateSlots(text, vars) {
  if (!text) return '';
  return String(text).replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key];
    return val == null ? '' : String(val);
  });
}
