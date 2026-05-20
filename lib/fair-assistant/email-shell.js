import { getFairEmailProducts } from '@/lib/fair-assistant/email-products';

const BRAND = {
  plum: '#5D3A5E',
  muted: '#8A6A7D',
  text: '#4F4F4F',
  bg: '#FDF7FA',
  border: '#E8E8E8',
};

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

/**
 * Render branded LoveLab fair outreach HTML.
 * Only message blocks vary; layout, logo, product grid, and footer are fixed.
 */
export function renderFairOutreachEmail({
  siteUrl,
  logoUrl,
  greeting,
  headline,
  paragraph1,
  paragraph2,
  signoff,
  ctaLine,
  products,
}) {
  const gridProducts = products || getFairEmailProducts(siteUrl);
  const logo = logoUrl || absUrl(siteUrl, '/logo.png');
  const cta = ctaLine || 'In the meantime, feel free to explore our collections at lovelab.be or contact us anytime.';

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
            <td align="center" style="padding:30px 50px 20px 50px;">
              <img src="${esc(logo)}" alt="LOVELAB" width="220" style="display:block;max-width:220px;height:auto;margin:0 auto;">
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 50px 10px 50px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 15px auto;">
                <tr><td style="width:40px;height:1px;background-color:#C9A665;"></td></tr>
              </table>
              ${headline ? `<h1 style="margin:0 0 15px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:400;color:${BRAND.plum};line-height:1.3;text-align:center;">${esc(headline)}</h1>` : ''}
              <p style="margin:0 0 15px 0;font-size:15px;line-height:1.7;color:${BRAND.text};text-align:left;">${nl2br(greeting)}</p>
              ${paragraph1 ? `<p style="margin:0 0 15px 0;font-size:15px;line-height:1.7;color:${BRAND.text};text-align:left;">${nl2br(paragraph1)}</p>` : ''}
              ${paragraph2 ? `<p style="margin:0 0 15px 0;font-size:15px;line-height:1.7;color:${BRAND.text};text-align:left;">${nl2br(paragraph2)}</p>` : ''}
              <p style="margin:0 0 8px 0;font-size:14px;line-height:1.7;color:${BRAND.text};text-align:left;">${nl2br(cta)} <a href="https://lovelab.be" style="color:${BRAND.plum};">lovelab.be</a></p>
              ${signoff ? `<p style="margin:16px 0 0 0;font-size:14px;line-height:1.7;color:${BRAND.text};text-align:left;">${nl2br(signoff)}</p>` : ''}
            </td>
          </tr>
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
            <td style="padding:20px 30px 30px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" width="33.33%" style="padding:10px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.border};border-radius:20px;width:100%;">
                      <tr><td align="center" style="padding:10px 5px;"><p style="margin:0;font-size:10px;color:#666;">All taxes and duties included</p></td></tr>
                    </table>
                  </td>
                  <td align="center" width="33.33%" style="padding:10px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.border};border-radius:20px;width:100%;">
                      <tr><td align="center" style="padding:10px 5px;"><p style="margin:0;font-size:10px;color:#666;">14 days return</p></td></tr>
                    </table>
                  </td>
                  <td align="center" width="33.33%" style="padding:10px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.border};border-radius:20px;width:100%;">
                      <tr><td align="center" style="padding:10px 5px;"><p style="margin:0;font-size:10px;color:#666;">Worldwide shipping</p></td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:25px 30px;background-color:#ffffff;border-top:1px solid ${BRAND.border};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" width="33.33%" style="padding:10px;">
                    <a href="https://www.instagram.com/lovelab_antwerp/" target="_blank" style="text-decoration:underline;color:#333;font-size:13px;">@lovelab_antwerp</a>
                  </td>
                  <td align="center" width="33.33%" style="padding:10px;">
                    <a href="https://lovelab.be" target="_blank" style="text-decoration:underline;color:#333;font-size:13px;">lovelab.be</a>
                  </td>
                  <td align="center" width="33.33%" style="padding:10px;">
                    <a href="mailto:hello@love-lab.com" style="text-decoration:underline;color:#333;font-size:13px;">contact us</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:25px 40px;background-color:#F5F0EB;">
              <p style="margin:0;font-size:12px;color:#666;text-align:center;">Love Group BV · Antwerp, Belgium</p>
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
