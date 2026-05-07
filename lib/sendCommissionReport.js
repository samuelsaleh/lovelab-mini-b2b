/**
 * Phase 19/B6 — Email the monthly commission report to mom.
 *
 * Sends ONE email per agent (per Sam's decision):
 *   Subject: "LoveLab — Commission for Nicolas Vial — May 2026"
 *   To:      dionne@love-lab.com  (configurable via env COMMISSION_REPORT_RECIPIENT)
 *   Reply-to: the agent's own email, so mom can forward by hitting reply
 *   Body:    short HTML summary card + key numbers
 *   Attach:  the .xlsx
 *
 * Uses the existing lib/send-email.js wrapper which now supports
 * attachments. Returns { sent, message_id?, reason?, status?, error? }
 * — never throws; the caller decides what to do with a failure.
 */

import { sendEmail } from './send-email.js';

const DEFAULT_RECIPIENT = 'dionne@love-lab.com';
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
 * @param {string} [args.recipient]              — defaults to env COMMISSION_REPORT_RECIPIENT or DEFAULT_RECIPIENT
 * @param {string} [args.fromName]               — display name override
 * @returns {Promise<{ sent: boolean, message_id?: string, reason?: string, status?: number, error?: string, recipient: string }>}
 */
export async function sendCommissionReportEmail({
  buffer,
  agent,
  period,
  totals,
  recipient,
  fromName,
}) {
  const to = recipient || process.env.COMMISSION_REPORT_RECIPIENT || DEFAULT_RECIPIENT;
  const subject = `LoveLab — Commission for ${agent.name} — ${period.label}`;
  const filename = `${sanitiseFilenamePart(agent.name)} - ${period.label}.xlsx`;

  const html = buildHtml({ agent, period, totals });

  const result = await sendEmail({
    to,
    subject,
    html,
    replyTo: agent.email || undefined,
    attachments: [{ filename, content: Buffer.from(buffer) }],
  });

  return { ...result, recipient: to };
}

function fmtEuro(n) {
  return `€ ${(Number(n) || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildHtml({ agent, period, totals }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const orderLine = totals.orderCount > 0
    ? `<tr><td style="padding:6px 0;color:#666;">${totals.orderCount} order${totals.orderCount === 1 ? '' : 's'}</td><td style="padding:6px 0;color:#1a1a1a;text-align:right;font-weight:600;">${fmtEuro(totals.commissionTotal)}</td></tr>`
    : '';
  const bonusLine = totals.bonusCount > 0
    ? `<tr><td style="padding:6px 0;color:#666;">${totals.bonusCount} new-client bonus${totals.bonusCount === 1 ? '' : 'es'}</td><td style="padding:6px 0;color:${ACCENT_GOLD};text-align:right;font-weight:600;">${fmtEuro(totals.bonusTotal)}</td></tr>`
    : '';
  const looseLine = totals.looseSalesTotal > 0
    ? `<tr><td style="padding:6px 0;color:#666;">B2C individual sales</td><td style="padding:6px 0;color:${ACCENT_GOLD};text-align:right;font-weight:600;">${fmtEuro(totals.looseSalesTotal)}</td></tr>`
    : '';

  return `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;color:#1a1a1a;">
      ${siteUrl ? `<img src="${siteUrl}/logo.png" alt="LoveLab" style="height:42px;margin-bottom:24px;" />` : ''}

      <h2 style="font-size:20px;margin:0 0 8px;color:${BRAND_COLOR};">Commission for ${escapeHtml(agent.name)}</h2>
      <p style="font-size:14px;color:#666;margin:0 0 24px;">${escapeHtml(period.label)}</p>

      <div style="background:#FAF7FB;border-left:4px solid ${BRAND_COLOR};padding:16px 20px;margin:0 0 24px;border-radius:4px;">
        <div style="font-size:11px;color:#A68BA8;font-weight:600;letter-spacing:0.5px;">TOTAL DUE TO AGENT</div>
        <div style="font-size:28px;color:${ACCENT_GOLD};font-weight:700;margin-top:4px;">${fmtEuro(totals.grandTotal)}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 24px;">
        ${orderLine}${bonusLine}${looseLine}
      </table>

      <p style="font-size:13px;color:#666;line-height:1.6;margin:0 0 24px;">
        The full breakdown is attached as an Excel file.
        Reply to this email to reach ${escapeHtml(agent.name)} directly.
      </p>

      <p style="font-size:11px;color:#aaa;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">
        Generated automatically by LoveLab B2B on the 1st of the month.
        This email contains only orders the customer has confirmed paid.
      </p>
    </div>
  `;
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
