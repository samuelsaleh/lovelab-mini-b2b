/**
 * Phase 19/B6 — Email the monthly commission report to Dionne only.
 *
 * Sends ONE email per agent report:
 *   Subject: "LoveLab — Commission for Nicolas Vial — May 2026"
 *   To:      dionne@love-lab.com  (always — never the agent)
 *   Body:    short HTML summary card + key numbers
 *   Attach:  the .xlsx
 *
 * Agents are never emailed automatically or manually through this path.
 * Dionne sends the report to the agent herself when she is ready.
 *
 * Uses the existing lib/send-email.js wrapper which now supports
 * attachments. Returns { sent, message_id?, reason?, status?, error? }
 * — never throws; the caller decides what to do with a failure.
 */

import { sendEmail } from './send-email.js';

export const COMMISSION_REPORT_RECIPIENT = 'dionne@love-lab.com';
const BRAND_COLOR = '#5D3A5E';
const ACCENT_GOLD = '#C5A059';

/**
 * @param {object} args
 * @param {Buffer|Uint8Array} args.buffer        — the .xlsx bytes
 * @param {{ name: string, email?: string }} args.agent
 * @param {{ label: string }}              args.period
 * @param {{
 *   grandTotal: number,
 *   commissionTotal: number,
 *   bonusTotal: number,
 *   looseSalesTotal: number,
 *   orderCount: number,
 *   bonusCount: number,
 * }} args.totals
 * @returns {Promise<{ sent: boolean, message_id?: string, reason?: string, status?: number, error?: string, recipient: string }>}
 */
export async function sendCommissionReportEmail({
  buffer,
  agent,
  period,
  totals,
}) {
  const to = COMMISSION_REPORT_RECIPIENT;
  const subject = `LoveLab — Commission for ${agent.name} — ${period.label}`;
  const filename = `${sanitiseFilenamePart(agent.name)} - ${period.label}.xlsx`;

  const html = buildHtml({ agent, period, totals });

  const result = await sendEmail({
    to,
    subject,
    html,
    attachments: [{ filename, content: Buffer.from(buffer) }],
  });

  return { ...result, recipient: to };
}

function fmtEuro(n) {
  return `€ ${(Number(n) || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildHtml({ agent, period, totals }) {
  const rows = [
    totals.orderCount > 0 && `
      <tr>
        <td style="padding:10px 16px;font-size:14px;color:#555;border-bottom:1px solid #f0edf4;">
          ${totals.orderCount} B2B order${totals.orderCount === 1 ? '' : 's'}
        </td>
        <td style="padding:10px 16px;font-size:14px;color:#1a1a1a;font-weight:700;text-align:right;border-bottom:1px solid #f0edf4;">
          ${fmtEuro(totals.commissionTotal)}
        </td>
      </tr>`,
    totals.bonusCount > 0 && `
      <tr>
        <td style="padding:10px 16px;font-size:14px;color:#555;border-bottom:1px solid #f0edf4;">
          ${totals.bonusCount} new-client bonus${totals.bonusCount === 1 ? '' : 'es'}
        </td>
        <td style="padding:10px 16px;font-size:14px;color:${ACCENT_GOLD};font-weight:700;text-align:right;border-bottom:1px solid #f0edf4;">
          ${fmtEuro(totals.bonusTotal)}
        </td>
      </tr>`,
    totals.looseSalesTotal > 0 && `
      <tr>
        <td style="padding:10px 16px;font-size:14px;color:#555;border-bottom:1px solid #f0edf4;">
          B2C individual sales
        </td>
        <td style="padding:10px 16px;font-size:14px;color:${ACCENT_GOLD};font-weight:700;text-align:right;border-bottom:1px solid #f0edf4;">
          ${fmtEuro(totals.looseSalesTotal)}
        </td>
      </tr>`,
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f1f7;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f7;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;font-family:'Helvetica Neue',Arial,sans-serif;">

      <!-- Header bar -->
      <tr>
        <td style="background:${BRAND_COLOR};padding:20px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">LOVE</span><span style="font-size:22px;font-weight:400;color:rgba(255,255,255,0.85);letter-spacing:-0.5px;">LAB</span>
                <span style="font-size:11px;color:rgba(255,255,255,0.6);letter-spacing:2px;display:block;margin-top:1px;">ANTWERP</span>
              </td>
              <td align="right">
                <span style="font-size:12px;color:rgba(255,255,255,0.7);">Commission report</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Agent + period -->
      <tr>
        <td style="padding:24px 28px 0;">
          <p style="margin:0 0 4px;font-size:11px;color:#aaa;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Agent</p>
          <p style="margin:0;font-size:20px;font-weight:700;color:#1a1a1a;">${escapeHtml(agent.name)}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#888;">${escapeHtml(period.label)}</p>
        </td>
      </tr>

      <!-- Total due card -->
      <tr>
        <td style="padding:20px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7FB;border-radius:8px;border-left:4px solid ${ACCENT_GOLD};">
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0 0 4px;font-size:10px;color:#A68BA8;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Total due to agent</p>
                <p style="margin:0;font-size:32px;font-weight:800;color:${ACCENT_GOLD};">${fmtEuro(totals.grandTotal)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Breakdown rows -->
      ${rows ? `
      <tr>
        <td style="padding:0 28px 4px;">
          <p style="margin:0 0 8px;font-size:11px;color:#aaa;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Breakdown</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0edf4;border-radius:6px;overflow:hidden;">
            ${rows}
          </table>
        </td>
      </tr>` : ''}

      <!-- Message -->
      <tr>
        <td style="padding:20px 28px;">
          <p style="margin:0;font-size:13px;color:#666;line-height:1.7;">
            The full order breakdown is attached as an Excel file.<br>
            This copy is for your review only — forward it to ${escapeHtml(agent.name)} when you are ready.
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:16px 28px 24px;border-top:1px solid #f0edf4;">
          <p style="margin:0;font-size:11px;color:#bbb;line-height:1.6;">
            Generated by LoveLab B2B &middot; ${escapeHtml(period.label)}<br>
            Only includes orders the customer has confirmed paid.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitiseFilenamePart(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
