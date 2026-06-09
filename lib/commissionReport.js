/**
 * Monthly commission report — Excel builder (Phase 19/B1, simplified).
 *
 * The .xlsx that mom (admin) gets emailed on the 1st of each month for
 * each agent. Mirrors the layout mom built by hand for Corinne:
 *   - One main table: Date · Customer · Net · Commission (one row per
 *     order). One customer can appear several times if they ordered
 *     multiple times in the month.
 *   - Optional NEW-CLIENT BONUSES section, only rendered if any.
 *   - Optional B2C INDIVIDUAL SALES section (loose website orders the
 *     agent should be paid on), only rendered if any.
 *   - Big TOTAL DUE band at the bottom.
 *
 * Public API:
 *   buildReportData(...) → pure data shaping (no Excel side effects)
 *   generateCommissionReport({ data, logoBuffer, demoMode }) → Promise<Buffer>
 */

import ExcelJS from 'exceljs';
import { normalizeCustomerName } from './newClientBonus.js';

// ─── Brand palette ─────────────────────────────────────────────────────
const PLUM        = 'FF5D3A5E';
const PLUM_DARK   = 'FF3F2440';
const PLUM_TINT   = 'FFF1ECF2';
const PLUM_BAR    = 'FFFAF7FB';
const ROW_ZEBRA   = 'FFFAF7FB';
const ROW_PLAIN   = 'FFFFFFFF';
const TEXT_BODY   = 'FF2A2A2A';
const TEXT_MUTED  = 'FF8A8A8A';
const TEXT_LABEL  = 'FFA68BA8';
const ACCENT_GOLD       = 'FFC5A059';
const ACCENT_GOLD_BG    = 'FFFEF8E8';
const ACCENT_GOLD_DARK  = 'FF8A6A2C';
const SOFT_BORDER       = 'FFEDE3ED';
const WARN_BG     = 'FFFFF5E5';
const WARN_TX     = 'FFB35900';
const WHITE       = 'FFFFFFFF';

/** Registered entity / contact block printed at the bottom of every commission .xlsx. */
const COMPANY_LEGAL_FOOTER_FR =
  'Love-Lab – The Love Group,\n' +
  'une société constituée selon les lois belges,\n' +
  'dont le siège social est situé au Schupstraat 20, 2018 Antwerp, Belgium,\n' +
  'immatriculée à la Banque-Carrefour des Entreprises (BCE) sous le numéro 1017.670.055.\n\n' +
  'Coordonnées :\n' +
  'E-mail : hello@love-lab.com\n' +
  'Téléphone : +32 494 039 945';

// ─── Layout: 6 columns A..F (simpler, no shipping/rate/bonus mess) ──
const COLUMNS = [
  { key: 'date',       header: 'Date',       width: 14 },
  { key: 'client',     header: 'Customer',   width: 38 },
  { key: 'orderCount', header: '#',          width: 6  },
  { key: 'net',        header: 'Net total',  width: 16 },
  { key: 'commission', header: 'Commission', width: 16 },
  { key: 'spacer',     header: '',           width: 4  },
];
const NUM_COLS = COLUMNS.length;
const LAST_COL = String.fromCharCode(64 + NUM_COLS); // 'F'

// ─── Helpers ───────────────────────────────────────────────────────────
function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
function bottomOnly(color = SOFT_BORDER, style = 'thin') {
  return { bottom: { style, color: { argb: color } } };
}
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtMonthLong(d) {
  return new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
function fmtToday() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// ────────────────────────────────────────────────────────────────────────
// Data shaping (pure, testable)
// ────────────────────────────────────────────────────────────────────────
/**
 * @param {object} args
 * @param {object} args.agent
 * @param {Array}  args.commissions
 * @param {string|Date} args.periodStart
 * @param {string|Date} args.periodEnd
 * @param {boolean} [args.includeLooseSales=true]
 * @param {boolean} [args.snapshot=false] - If true, eligibility ignores the
 *   date window entirely and includes every pending+customer_paid commission.
 *   This is the "what does mom owe right now" view powering the manual
 *   "Send report now" button. The cron path keeps `snapshot=false` so its
 *   monthly Phase 21 filter still applies.
 * @param {string} [args.periodLabel] - When provided, overrides the
 *   auto-derived "May 2026" header label. Snapshot mode passes today's date
 *   here (e.g. "13 May 2026") so the .xlsx and email both stamp the day the
 *   report was generated, not a calendar month.
 */
export function buildReportData({
  agent,
  commissions,
  periodStart,
  periodEnd,
  includeLooseSales = true,
  snapshot = false,
  periodLabel,
}) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const hasValidWindow = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs;

  // Include commissions where:
  //   1. customer_paid_at is set (mom has ticked "customer paid this invoice")
  //   2. status is still pending (not yet paid out to the agent)
  //   3. customer_paid_at falls inside the requested period window
  //      (skipped entirely in snapshot mode)
  //
  // Phase 21 fix: pre-fix this filter ignored the period window and the
  // report swept in EVERY pending+customer-paid commission. So a "Corinne
  // April 2026" report generated on 12 May would include the May order
  // Corinne ticked Paid that morning. The header said April, the body
  // said May+April — exactly the bug Sam reported.
  //
  // Snapshot mode (Sam's 2026-05-13 redesign) intentionally re-introduces
  // the legacy "no window" behaviour for the manual button, because the
  // button is always "what's ready to pay right now" — there's no notion
  // of a calendar month involved.
  //
  // If the period bounds are invalid we also fall back to "no window" so
  // old callers don't silently empty out.
  const eligible = (commissions || []).filter((c) => {
    if (!c) return false;
    if (c.status === 'cancelled' || c.status === 'paid') return false;
    if (!c.customer_paid_at) return false;
    if (!['order', 'new_client_bonus', 'bonus'].includes(c.type)) return false;
    if (snapshot) return true;
    if (!hasValidWindow) return true;
    const paidAtMs = new Date(c.customer_paid_at).getTime();
    if (!Number.isFinite(paidAtMs)) return false;
    return paidAtMs >= startMs && paidAtMs <= endMs;
  });

  const orders = [];
  const bonusesArr = [];
  const looseSales = [];

  for (const c of eligible) {
    const doc = c.document || {};
    const grossFromDoc = Number(doc.total_amount);
    const net = Number(c.order_total) || 0;
    const gross = Number.isFinite(grossFromDoc) && grossFromDoc > 0 ? grossFromDoc : net;
    const shipping = round2(Math.max(0, gross - net));
    const rate = Number(c.commission_rate) || 0;
    const commission = Number(c.commission_amount) || 0;
    const clientName =
      doc.client_company ||
      doc.client_name ||
      (c.type === 'new_client_bonus' || c.type === 'bonus' ? 'Manual bonus' : 'Order');
    const isLooseB2C = doc.order_channel === 'b2c';
    const dateIso = c.document?.created_at || c.created_at;

    if (c.type === 'order') {
      const row = {
        date: dateIso,
        client: clientName,
        gross: round2(gross),
        shipping,
        net: round2(net),
        rate,
        commission: round2(commission),
        bonus: 0,
        type: 'order',
        isLooseB2C,
        commission_id: c.id || null,
        document_id: doc.id || null,
      };
      if (includeLooseSales && isLooseB2C) looseSales.push(row);
      else orders.push(row);
    } else {
      bonusesArr.push({
        date: dateIso,
        client: clientName,
        amount: round2(commission),
        type: c.type,
        commission_id: c.id || null,
        document_id: doc.id || null,
      });
    }
  }

  orders.sort((a, b) => new Date(a.date) - new Date(b.date));
  looseSales.sort((a, b) => new Date(a.date) - new Date(b.date));
  bonusesArr.sort((a, b) => new Date(a.date) - new Date(b.date));

  const customerMap = new Map();
  const upsertCustomer = (rawName, fields) => {
    const key = normalizeCustomerName(rawName);
    if (!key) return;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        name: rawName, key, count: 0,
        gross: 0, net: 0, commission: 0, bonus: 0, total: 0,
      });
    }
    const c = customerMap.get(key);
    if (fields.count) c.count += fields.count;
    if (fields.gross) c.gross = round2(c.gross + fields.gross);
    if (fields.net) c.net = round2(c.net + fields.net);
    if (fields.commission) c.commission = round2(c.commission + fields.commission);
    if (fields.bonus) c.bonus = round2(c.bonus + fields.bonus);
    c.total = round2(c.commission + c.bonus);
  };
  for (const o of orders) {
    upsertCustomer(o.client, { count: 1, gross: o.gross, net: o.net, commission: o.commission });
  }
  for (const b of bonusesArr) upsertCustomer(b.client, { bonus: b.amount });
  const customers = [...customerMap.values()].sort((a, b) => b.total - a.total);

  const grossTotal = round2(orders.reduce((s, o) => s + o.gross, 0));
  const netTotal = round2(orders.reduce((s, o) => s + o.net, 0));
  const commissionTotal = round2(orders.reduce((s, o) => s + o.commission, 0));
  const bonusTotal = round2(bonusesArr.reduce((s, b) => s + b.amount, 0));
  const looseSalesTotal = round2(looseSales.reduce((s, o) => s + o.commission, 0));
  const grandTotal = round2(commissionTotal + bonusTotal + looseSalesTotal);

  return {
    agent: {
      id: agent.id,
      name: agent.full_name || agent.email || 'Agent',
      email: agent.email || '',
      commission_rate: Number(agent.commission_rate) || 0,
    },
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      // Snapshot callers pass today's date as `periodLabel`; cron callers
      // omit it and we fall back to "Month YYYY" for back-compat.
      label: periodLabel || fmtMonthLong(start),
    },
    orders,
    customers,
    bonuses: bonusesArr,
    looseSales,
    // Every commission row swept into this report — used to mark them paid
    // out once the report is generated so they don't reappear next time.
    includedCommissionIds: eligible.map((c) => c.id).filter(Boolean),
    totals: {
      grossTotal, netTotal, commissionTotal, bonusTotal, looseSalesTotal, grandTotal,
      orderCount: orders.length,
      customerCount: customers.length,
      bonusCount: bonusesArr.length,
      looseSalesCount: looseSales.length,
    },
  };
}

/**
 * Resolve commission row ids from a stored report snapshot.
 * New reports store `includedCommissionIds`; older ones only have
 * per-row `commission_id` or `document_id` for legacy backfill.
 */
export function commissionIdsFromReportSnapshot(snapshot) {
  if (!snapshot) return [];

  if (Array.isArray(snapshot.includedCommissionIds) && snapshot.includedCommissionIds.length > 0) {
    return [...new Set(snapshot.includedCommissionIds.filter(Boolean))];
  }

  const ids = new Set();
  for (const section of ['orders', 'looseSales', 'bonuses']) {
    for (const row of snapshot[section] || []) {
      if (row?.commission_id) ids.add(row.commission_id);
    }
  }
  return [...ids];
}

/** Document ids referenced in a report snapshot (legacy backfill path). */
export function documentIdsFromReportSnapshot(snapshot) {
  if (!snapshot) return [];
  const ids = new Set();
  for (const section of ['orders', 'looseSales', 'bonuses']) {
    for (const row of snapshot[section] || []) {
      if (row?.document_id) ids.add(row.document_id);
    }
  }
  return [...ids];
}

// ────────────────────────────────────────────────────────────────────────
// Excel rendering — simplified, mom's-style layout
// ────────────────────────────────────────────────────────────────────────
export async function generateCommissionReport({ data, logoBuffer = null, demoMode = false }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LoveLab';
  wb.lastModifiedBy = 'LoveLab';
  wb.created = new Date();
  wb.modified = new Date();

  const sheetTitle = `${data.period.label}`.slice(0, 31);
  const ws = wb.addWorksheet(sheetTitle, {
    views: [{ state: 'normal', showGridLines: false }],
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
    },
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = COLUMNS.map((c) => ({ width: c.width }));

  let r = 1;

  // ════════════════════════════════════════════════════════════════════
  // HERO HEADER — one tall plum band (row 1)
  //
  //   ┌─────────────────────────────────────────────────────────────┐
  //   │  [logo 50×50]                COMMISSION REPORT · MAY 2026   │
  //   └─────────────────────────────────────────────────────────────┘
  //
  // The logo PNG is square (1024×1024) so we render it at 50×50 to
  // preserve its aspect ratio. The row is 64px tall to give the logo
  // breathing room. The title text on the right is vertically centred.
  // ════════════════════════════════════════════════════════════════════
  ws.getRow(1).height = 64;
  ws.mergeCells(`A1:${LAST_COL}1`);
  for (let c = 1; c <= NUM_COLS; c++) ws.getCell(1, c).fill = fill(PLUM);

  if (logoBuffer) {
    try {
      const imageId = wb.addImage({ buffer: logoBuffer, extension: 'png' });
      ws.addImage(imageId, {
        tl: { col: 0.2, row: 0.12 },     // ≈ 7px in from the left, vertically nudged
        ext: { width: 50, height: 50 },  // square — logo is 1024×1024
        editAs: 'oneCell',
      });
    } catch { /* silent fall-through */ }
  }

  // Title on the right, vertically centred in the same row
  ws.getCell('A1').value = {
    richText: [
      { text: 'COMMISSION REPORT  ', font: { name: 'Calibri', size: 16, bold: true, color: { argb: WHITE } } },
      { text: data.period.label.toUpperCase(), font: { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFE6D9E8' } } },
    ],
  };
  ws.getCell('A1').alignment = { horizontal: 'right', vertical: 'middle', indent: 2 };

  r = 2;

  // Agent strip
  ws.getRow(r).height = 28;
  for (let c = 1; c <= NUM_COLS; c++) ws.getCell(r, c).fill = fill(PLUM_TINT);
  ws.mergeCells(`A${r}:C${r}`);
  ws.getCell(`A${r}`).value = data.agent.name;
  ws.getCell(`A${r}`).font = { name: 'Calibri', size: 13, bold: true, color: { argb: PLUM_DARK } };
  ws.getCell(`A${r}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
  ws.mergeCells(`D${r}:${LAST_COL}${r}`);
  ws.getCell(`D${r}`).value = `Rate ${data.agent.commission_rate || 0}%   ·   Sent ${fmtToday()}`;
  ws.getCell(`D${r}`).font = { name: 'Calibri', size: 10, color: { argb: TEXT_MUTED }, italic: true };
  ws.getCell(`D${r}`).alignment = { horizontal: 'right', vertical: 'middle', indent: 2 };
  r += 1;

  // ════════════════════════════════════════════════════════════════════
  // DEMO BANNER (only when called from the test script with --include-all)
  // ════════════════════════════════════════════════════════════════════
  if (demoMode) {
    ws.getRow(r).height = 8;
    r += 1;
    ws.getRow(r).height = 38;
    ws.mergeCells(`A${r}:${LAST_COL}${r}`);
    const banner = ws.getCell(`A${r}`);
    banner.value = '⚠  DEMO PREVIEW — showing every order regardless of the "Customer paid?" checkbox. In production, only orders mom has ticked as paid will appear in this file.';
    banner.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: WARN_TX } };
    banner.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 2 };
    banner.fill = fill(WARN_BG);
    banner.border = { left: { style: 'medium', color: { argb: WARN_TX } } };
    r += 1;
  }

  ws.getRow(r).height = 14;
  r += 1;

  // ════════════════════════════════════════════════════════════════════
  // HERO TOTAL CARD + 3 small stat cards
  // ════════════════════════════════════════════════════════════════════
  // Big "Total due" card (cols A:C, 2 rows)
  // Then 3 small stats (cols D, E, spacer F):
  //   - # Orders
  //   - # New customers
  //   - Net sales
  // Layout: A:C big card, D small, E small (we squeeze "Net sales" into the
  // big card's footer to keep it visually clean).
  const cardLabelRow = r;
  const cardValueRow = r + 1;
  ws.getRow(cardLabelRow).height = 18;
  ws.getRow(cardValueRow).height = 36;

  // Hero gold card on the LEFT — TOTAL DUE
  ws.mergeCells(`A${cardLabelRow}:C${cardLabelRow}`);
  ws.mergeCells(`A${cardValueRow}:C${cardValueRow}`);
  const heroLabel = ws.getCell(`A${cardLabelRow}`);
  heroLabel.value = 'TOTAL DUE TO AGENT';
  heroLabel.font = { name: 'Calibri', size: 9, bold: true, color: { argb: ACCENT_GOLD_DARK } };
  heroLabel.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
  heroLabel.fill = fill(ACCENT_GOLD_BG);
  heroLabel.border = { top: { style: 'medium', color: { argb: ACCENT_GOLD } } };
  const heroVal = ws.getCell(`A${cardValueRow}`);
  heroVal.value = data.totals.grandTotal;
  heroVal.numFmt = '#,##0.00 "€"';
  heroVal.font = { name: 'Calibri', size: 22, bold: true, color: { argb: ACCENT_GOLD_DARK } };
  heroVal.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
  heroVal.fill = fill(ACCENT_GOLD_BG);
  heroVal.border = { bottom: { style: 'thin', color: { argb: ACCENT_GOLD } } };

  // Mini cards on the RIGHT
  const miniCards = [
    { col: 'D', label: 'ORDERS',         value: data.totals.orderCount,          fmt: '0' },
    { col: 'E', label: 'NEW CUSTOMERS',  value: data.totals.bonusCount,          fmt: '0' },
    { col: 'F', label: 'NET SALES',      value: data.totals.netTotal,            fmt: '#,##0 "€"' },
  ];
  for (const mc of miniCards) {
    const lc = ws.getCell(`${mc.col}${cardLabelRow}`);
    lc.value = mc.label;
    lc.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: TEXT_LABEL } };
    lc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    lc.fill = fill(PLUM_TINT);
    lc.border = { top: { style: 'thin', color: { argb: PLUM } } };
    const vc = ws.getCell(`${mc.col}${cardValueRow}`);
    vc.value = mc.value;
    vc.numFmt = mc.fmt;
    vc.font = { name: 'Calibri', size: 14, bold: true, color: { argb: PLUM_DARK } };
    vc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    vc.fill = fill(PLUM_TINT);
    vc.border = { bottom: { style: 'thin', color: { argb: SOFT_BORDER } } };
  }

  r = cardValueRow + 1;
  ws.getRow(r).height = 14;
  r += 1;

  // ════════════════════════════════════════════════════════════════════
  // MAIN TABLE — one row per order (Date · Customer · Net · Commission)
  // ════════════════════════════════════════════════════════════════════
  // Header reads "COMMISSIONS" so it works for both a calendar-month report
  // ("April 2026") and an on-demand snapshot ("13 May 2026"). The big
  // header band already spells out the period right above this section.
  r = renderSectionHeader(ws, r, 'COMMISSIONS', PLUM, PLUM_TINT);

  // Column headers
  ws.getRow(r).height = 22;
  ws.getCell(`A${r}`).value = 'Date';
  ws.getCell(`B${r}`).value = 'Customer';
  ws.getCell(`C${r}`).value = '';
  ws.getCell(`D${r}`).value = 'Net';
  ws.getCell(`E${r}`).value = 'Commission';
  ws.getCell(`F${r}`).value = '';
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col, i) => {
    const cell = ws.getCell(`${col}${r}`);
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: TEXT_LABEL } };
    cell.alignment = { horizontal: i < 2 ? 'left' : 'right', vertical: 'middle', indent: i < 2 ? 2 : 1 };
    cell.border = bottomOnly(SOFT_BORDER, 'thin');
  });
  ws.mergeCells(`B${r}:C${r}`);
  r += 1;

  if (data.orders.length === 0) {
    ws.getRow(r).height = 60;
    ws.mergeCells(`A${r}:${LAST_COL}${r}`);
    const cell = ws.getCell(`A${r}`);
    cell.value = `No orders to pay out yet.\nMom must tick the “Customer paid?” checkbox in the admin panel for an order to appear here.`;
    cell.font = { name: 'Calibri', size: 10.5, italic: true, color: { argb: TEXT_MUTED } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    r += 1;
  } else {
    data.orders.forEach((o, i) => {
      const isAlt = i % 2 === 1;
      const bg = isAlt ? ROW_ZEBRA : ROW_PLAIN;
      ws.getRow(r).height = 22;
      ws.getCell(`A${r}`).value = fmtDate(o.date);
      ws.mergeCells(`B${r}:C${r}`);
      ws.getCell(`B${r}`).value = o.client;
      ws.getCell(`D${r}`).value = o.net;
      ws.getCell(`E${r}`).value = o.commission;
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col, idx) => {
        const cell = ws.getCell(`${col}${r}`);
        cell.fill = fill(bg);
        cell.font = { name: 'Calibri', size: 11, color: { argb: TEXT_BODY } };
        cell.border = bottomOnly(SOFT_BORDER, 'hair');
        if (idx < 2) cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
        else cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        if (col === 'D' || col === 'E') cell.numFmt = '#,##0.00 "€"';
      });
      ws.getCell(`B${r}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: PLUM_DARK } };
      ws.getCell(`E${r}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: PLUM_DARK } };
      r += 1;
    });

    // Totals row
    ws.getRow(r).height = 28;
    ws.getCell(`A${r}`).value = `Total — ${data.totals.orderCount} order${data.totals.orderCount === 1 ? '' : 's'}`;
    ws.mergeCells(`B${r}:C${r}`);
    ws.getCell(`B${r}`).value = `${data.totals.customerCount} customer${data.totals.customerCount === 1 ? '' : 's'}`;
    ws.getCell(`D${r}`).value = data.totals.netTotal;
    ws.getCell(`E${r}`).value = data.totals.commissionTotal;
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col, idx) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.fill = fill(PLUM_TINT);
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: PLUM_DARK } };
      cell.border = { top: { style: 'thin', color: { argb: PLUM } } };
      if (idx < 2) cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
      else cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      if (col === 'D' || col === 'E') cell.numFmt = '#,##0.00 "€"';
    });
    r += 1;
  }
  r += 2;

  // ════════════════════════════════════════════════════════════════════
  // NEW-CLIENT BONUSES — only if any
  // ════════════════════════════════════════════════════════════════════
  if (data.bonuses.length > 0) {
    r = renderSectionHeader(ws, r, 'NEW-CLIENT BONUSES', ACCENT_GOLD_DARK, ACCENT_GOLD_BG);

    ws.getRow(r).height = 22;
    ws.getCell(`A${r}`).value = 'Date';
    ws.mergeCells(`B${r}:C${r}`);
    ws.getCell(`B${r}`).value = 'New customer';
    ws.getCell(`D${r}`).value = '';
    ws.mergeCells(`E${r}:F${r}`);
    ws.getCell(`E${r}`).value = 'Bonus paid';
    ['A', 'B', 'D', 'E'].forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: ACCENT_GOLD_DARK } };
      cell.alignment = { horizontal: col === 'E' ? 'right' : 'left', vertical: 'middle', indent: col === 'E' ? 1 : 2 };
      cell.border = bottomOnly(ACCENT_GOLD, 'thin');
    });
    r += 1;

    data.bonuses.forEach((b, i) => {
      const isAlt = i % 2 === 1;
      const bg = isAlt ? ROW_ZEBRA : ROW_PLAIN;
      ws.getRow(r).height = 22;
      ws.getCell(`A${r}`).value = fmtDate(b.date);
      ws.mergeCells(`B${r}:C${r}`);
      ws.getCell(`B${r}`).value = b.client;
      ws.mergeCells(`E${r}:F${r}`);
      ws.getCell(`E${r}`).value = b.amount;
      ws.getCell(`E${r}`).numFmt = '#,##0.00 "€"';
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col) => {
        const cell = ws.getCell(`${col}${r}`);
        cell.fill = fill(bg);
        cell.font = { name: 'Calibri', size: 11, color: { argb: TEXT_BODY } };
        cell.border = bottomOnly(SOFT_BORDER, 'hair');
      });
      ws.getCell(`A${r}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
      ws.getCell(`B${r}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
      ws.getCell(`B${r}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: PLUM_DARK } };
      ws.getCell(`E${r}`).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      ws.getCell(`E${r}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: ACCENT_GOLD_DARK } };
      r += 1;
    });

    // Subtotal
    ws.getRow(r).height = 26;
    ws.mergeCells(`A${r}:D${r}`);
    ws.getCell(`A${r}`).value = `Total — ${data.totals.bonusCount} new customer${data.totals.bonusCount === 1 ? '' : 's'}`;
    ws.mergeCells(`E${r}:F${r}`);
    ws.getCell(`E${r}`).value = data.totals.bonusTotal;
    ws.getCell(`E${r}`).numFmt = '#,##0.00 "€"';
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.fill = fill(ACCENT_GOLD_BG);
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: ACCENT_GOLD_DARK } };
      cell.border = { top: { style: 'thin', color: { argb: ACCENT_GOLD } } };
    });
    ws.getCell(`A${r}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
    ws.getCell(`E${r}`).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    r += 1;
    r += 2;
  }

  // ════════════════════════════════════════════════════════════════════
  // B2C INDIVIDUAL SALES — only if any
  // ════════════════════════════════════════════════════════════════════
  if (data.looseSales.length > 0) {
    r = renderSectionHeader(ws, r, 'B2C INDIVIDUAL SALES (website)', ACCENT_GOLD_DARK, ACCENT_GOLD_BG);

    ws.getRow(r).height = 22;
    ws.getCell(`A${r}`).value = 'Date';
    ws.mergeCells(`B${r}:C${r}`);
    ws.getCell(`B${r}`).value = 'Customer';
    ws.getCell(`D${r}`).value = 'Net';
    ws.getCell(`E${r}`).value = 'Commission';
    ['A', 'B', 'D', 'E'].forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: ACCENT_GOLD_DARK } };
      cell.alignment = { horizontal: ['D', 'E'].includes(col) ? 'right' : 'left', vertical: 'middle', indent: ['D', 'E'].includes(col) ? 1 : 2 };
      cell.border = bottomOnly(ACCENT_GOLD, 'thin');
    });
    r += 1;

    data.looseSales.forEach((o, i) => {
      const isAlt = i % 2 === 1;
      const bg = isAlt ? ROW_ZEBRA : ROW_PLAIN;
      ws.getRow(r).height = 22;
      ws.getCell(`A${r}`).value = fmtDate(o.date);
      ws.mergeCells(`B${r}:C${r}`);
      ws.getCell(`B${r}`).value = o.client || '—';
      ws.getCell(`D${r}`).value = o.net;
      ws.getCell(`E${r}`).value = o.commission;
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col) => {
        const cell = ws.getCell(`${col}${r}`);
        cell.fill = fill(bg);
        cell.font = { name: 'Calibri', size: 11, color: { argb: TEXT_BODY } };
        cell.border = bottomOnly(SOFT_BORDER, 'hair');
        if (col === 'A' || col === 'B' || col === 'C') cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
        else cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        if (col === 'D' || col === 'E') cell.numFmt = '#,##0.00 "€"';
      });
      ws.getCell(`E${r}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: ACCENT_GOLD_DARK } };
      r += 1;
    });

    // Subtotal
    ws.getRow(r).height = 26;
    ws.mergeCells(`A${r}:C${r}`);
    ws.getCell(`A${r}`).value = `Total — ${data.totals.looseSalesCount} B2C order${data.totals.looseSalesCount === 1 ? '' : 's'}`;
    ws.getCell(`D${r}`).value = data.totals.netTotal > 0 ? null : null;
    ws.getCell(`E${r}`).value = data.totals.looseSalesTotal;
    ws.getCell(`E${r}`).numFmt = '#,##0.00 "€"';
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.fill = fill(ACCENT_GOLD_BG);
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: ACCENT_GOLD_DARK } };
      cell.border = { top: { style: 'thin', color: { argb: ACCENT_GOLD } } };
    });
    ws.getCell(`A${r}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
    ws.getCell(`E${r}`).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    r += 1;
    r += 2;
  }

  // ════════════════════════════════════════════════════════════════════
  // GRAND TOTAL band
  // ════════════════════════════════════════════════════════════════════
  ws.getRow(r).height = 12;
  for (let c = 1; c <= NUM_COLS; c++) ws.getCell(r, c).fill = fill(PLUM_TINT);
  r += 1;

  ws.getRow(r).height = 44;
  ws.mergeCells(`A${r}:C${r}`);
  ws.getCell(`A${r}`).value = 'TOTAL DUE TO AGENT';
  ws.getCell(`A${r}`).font = { name: 'Calibri', size: 16, bold: true, color: { argb: WHITE } };
  ws.getCell(`A${r}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 3 };

  ws.mergeCells(`D${r}:${LAST_COL}${r}`);
  ws.getCell(`D${r}`).value = data.totals.grandTotal;
  ws.getCell(`D${r}`).numFmt = '#,##0.00 "€"';
  ws.getCell(`D${r}`).font = { name: 'Calibri', size: 22, bold: true, color: { argb: WHITE } };
  ws.getCell(`D${r}`).alignment = { horizontal: 'right', vertical: 'middle', indent: 2 };
  for (let c = 1; c <= NUM_COLS; c++) ws.getCell(r, c).fill = fill(PLUM);
  r += 1;

  ws.getRow(r).height = 6;
  for (let c = 1; c <= NUM_COLS; c++) ws.getCell(r, c).fill = fill(ACCENT_GOLD);
  r += 1;
  r += 1;

  // ════════════════════════════════════════════════════════════════════
  // Footer caption
  // ════════════════════════════════════════════════════════════════════
  ws.getRow(r).height = 56;
  ws.mergeCells(`A${r}:${LAST_COL}${r}`);
  const captionCell = ws.getCell(`A${r}`);
  captionCell.value =
    `How this works: this report includes only orders mom has confirmed paid via the "Customer paid?" checkbox in the admin panel during ${data.period.label}. ` +
    `Net = order total − shipping. Commission is paid on Net only. ` +
    `New-client bonuses are paid once per customer (LoveLab company decision) and B2C individual sales are website orders manually attributed to this agent.`;
  captionCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: TEXT_MUTED } };
  captionCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 2 };

  r += 1;
  ws.getRow(r).height = 10;
  r += 1;

  // Legal entity + BCE + contact (requested for professional invoicing-style docs).
  ws.getRow(r).height = 132;
  ws.mergeCells(`A${r}:${LAST_COL}${r}`);
  const legalCell = ws.getCell(`A${r}`);
  legalCell.value = COMPANY_LEGAL_FOOTER_FR;
  legalCell.font = { name: 'Calibri', size: 8.5, color: { argb: TEXT_BODY } };
  legalCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 2 };

  ws.pageSetup.printArea = `A1:${LAST_COL}${r}`;

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────
function renderSectionHeader(ws, r, label, accent, bg) {
  ws.getRow(r).height = 26;
  ws.mergeCells(`A${r}:F${r}`);
  const cell = ws.getCell(`A${r}`);
  cell.value = label;
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: accent } };
  cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
  cell.fill = fill(bg);
  cell.border = { left: { style: 'medium', color: { argb: accent } } };
  return r + 1;
}
