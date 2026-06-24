/**
 * Email the SYNALIA quarterly report to Dionne (admin).
 */

import { sendEmail } from './send-email.js';

const DEFAULT_RECIPIENT = 'dionne@love-lab.com';
const BRAND_COLOR = '#5D3A5E';
const ACCENT_GOLD = '#C5A059';

/**
 * @param {object} args
 * @param {Buffer} args.buffer
 * @param {{ name: string, email?: string }} args.agent
 * @param {{ label: string, labelLong: string }} args.period
 * @param {{ orderCount: number, clientCount: number, grandTotal: number }} args.totals
 * @param {string} [args.driveViewLink]
 * @param {string} [args.recipient]
 */
export async function sendSynaliaReportEmail({
  buffer,
  agent,
  period,
  totals,
  driveViewLink,
  recipient,
}) {
  const to = recipient || process.env.SYNALIA_REPORT_RECIPIENT || DEFAULT_RECIPIENT;
  const subject = `LoveLab — Rapport SYNALIA — ${agent.name} — ${period.label}`;
  const filename = `${sanitiseFilenamePart(agent.name)} - SYNALIA ${period.label}.xlsx`;
  const html = buildHtml({ agent, period, totals, driveViewLink });

  const result = await sendEmail({
    to,
    subject,
    html,
    replyTo: agent.email || undefined,
    attachments: [{ filename, content: Buffer.from(buffer) }],
  });

  return { ...result, recipient: to };
}

function sanitiseFilenamePart(s) {
  return String(s || 'Agent').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ') || 'Agent';
}

function fmtEuro(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
}

function buildHtml({ agent, period, totals, driveViewLink }) {
  const driveBlock = driveViewLink
    ? `<p style="margin:16px 0;"><a href="${driveViewLink}" style="color:${BRAND_COLOR};font-weight:700;">Ouvrir le fichier dans Google Drive</a></p>`
    : '<p style="margin:16px 0;color:#888;">Le fichier est en pièce jointe (upload Drive non disponible).</p>';

  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#2a2a2a;">
      <h2 style="color:${BRAND_COLOR};margin:0 0 8px;">Rapport SYNALIA</h2>
      <p style="margin:0 0 4px;"><strong>${agent.name}</strong></p>
      <p style="margin:0 0 16px;color:#666;">${period.labelLong}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee;">Commandes Synalia</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${totals.orderCount}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee;">Clients adhérents</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${totals.clientCount}</td></tr>
        <tr><td style="padding:8px 0;">Total CA TTC</td><td style="padding:8px 0;text-align:right;font-weight:700;color:${ACCENT_GOLD};font-size:18px;">${fmtEuro(totals.grandTotal)}</td></tr>
      </table>
      ${driveBlock}
      <p style="font-size:12px;color:#999;margin-top:24px;">LoveLab B2B — rapport trimestriel SYNALIA (séparé du commission report).</p>
    </div>
  `;
}
