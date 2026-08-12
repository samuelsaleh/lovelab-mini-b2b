/**
 * Excel export for the Analytics dashboard.
 *
 * One row per order/quote, with the client contact details that live in
 * `metadata.formState`. The existing Admin → Reports export only carries
 * Date/Client/Country/City/Event/Type/Source/Amount, which is enough to read
 * revenue but not enough to follow up with the shops met at a fair — so this
 * export adds contact name, email, phone, VAT and the postal address.
 *
 * Rows are built from whatever the dashboard is currently showing, so the
 * channel pills and the Event dropdown decide what ends up in the file.
 */

import { normalizeCountry } from './countries.js';
import { derivePostalAndCity } from './clientAddress.js';

// Re-exported because the export was where this parsing started; Admin →
// Reports now reads the same helper so both screens agree on the city.
export { derivePostalAndCity };

export const ANALYTICS_EXPORT_COLUMNS = [
  { key: 'date', header: 'Date', width: 12 },
  { key: 'type', header: 'Type', width: 10 },
  { key: 'event', header: 'Event / Fair', width: 26 },
  { key: 'company', header: 'Company', width: 32 },
  { key: 'contact', header: 'Contact', width: 24 },
  { key: 'email', header: 'Email', width: 30 },
  { key: 'phone', header: 'Phone', width: 18 },
  { key: 'vat', header: 'VAT', width: 20 },
  { key: 'address', header: 'Address', width: 34 },
  { key: 'postalCode', header: 'Postal code', width: 13 },
  { key: 'city', header: 'City', width: 20 },
  { key: 'country', header: 'Country', width: 18 },
  { key: 'channel', header: 'Channel', width: 12 },
  { key: 'amount', header: 'Amount', width: 15, numeric: true },
];

const CHANNEL_LABELS = {
  b2b: 'B2B',
  b2c: 'B2C',
  internal: 'Internal',
  consignment: 'Consignment',
  delete_from_stock: 'Write-off',
};

const clean = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ');
};

/** Prefer the first non-empty candidate. */
const firstOf = (...candidates) => {
  for (const c of candidates) {
    const v = clean(c);
    if (v) return v;
  }
  return '';
};

/**
 * The order form writes the street across two lines. Join them so the export
 * has one usable address cell, without leaving a stray separator when only
 * one line was filled in.
 */
function joinAddress(formState) {
  return [formState.addressLine1, formState.addressLine2]
    .map(clean)
    .filter(Boolean)
    .join(', ');
}

/**
 * Turn documents into export rows — one row per document, in the order the
 * dashboard received them, newest first.
 *
 * @param {Array<object>} documents
 * @returns {Array<object>} rows keyed by ANALYTICS_EXPORT_COLUMNS keys
 */
export function buildAnalyticsExportRows(documents) {
  const list = Array.isArray(documents) ? documents : [];
  return list.map((doc) => {
    const meta = doc?.metadata || {};
    const formState = meta.formState || {};
    const { postalCode, city } = derivePostalAndCity(formState);
    return {
      date: doc?.created_at ? new Date(doc.created_at).toISOString().slice(0, 10) : '',
      type: clean(doc?.document_type) || 'order',
      // The folder is the reliable answer; the free-text "Event / Fair" field
      // on the order form is the fallback for documents filed nowhere.
      event: firstOf(doc?.events?.name, formState.eventName, meta.eventName) || 'No Event',
      company: firstOf(doc?.client_company, formState.companyName),
      contact: firstOf(formState.contactName, doc?.client_name),
      email: firstOf(formState.email),
      phone: firstOf(formState.phone),
      vat: firstOf(formState.vatNumber),
      address: joinAddress(formState),
      postalCode,
      city,
      country: normalizeCountry(formState.country),
      channel: CHANNEL_LABELS[doc?.order_channel] || clean(doc?.order_channel) || 'B2B',
      amount: Number(doc?.total_amount) || 0,
    };
  });
}

/** Totals shown in the sheet header, computed from the exported rows. */
export function summariseExportRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const orders = list.filter((r) => r.type === 'order');
  const revenue = orders.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const companies = new Set(list.map((r) => r.company.toLowerCase()).filter(Boolean));
  return {
    revenue,
    orderCount: orders.length,
    quoteCount: list.filter((r) => r.type === 'quote').length,
    clientCount: companies.size,
    rowCount: list.length,
  };
}

const slug = (value) =>
  clean(value)
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);

export function analyticsExportFilename({ eventName, channelScope, now = new Date() } = {}) {
  const parts = ['LoveLab_Analytics'];
  const eventSlug = slug(eventName);
  if (eventSlug) parts.push(eventSlug);
  if (channelScope && channelScope !== 'all') parts.push(String(channelScope).toUpperCase());
  parts.push(now.toISOString().slice(0, 10));
  return `${parts.join('_')}.xlsx`;
}

// ── Workbook ───────────────────────────────────────────────────────────────
// Same brand palette as the Admin → Reports export so the two files look
// like they came from the same place.

const PLUM = 'FF5D3A5E';
const PLUM_DARK = 'FF4A2545';
const PLUM_MID = 'FF7A4F7C';
const WHITE = 'FFFFFFFF';
const LIGHT_ROW = 'FFFFF9FF';
const TEXT_GRAY = 'FF4F4F4F';
const KPI_GRAY = 'FF8A6A7D';
const KPI_BG = 'FFFFF7FF';

const HEADER_ROW = 7;

/**
 * Build the styled workbook. ExcelJS is imported lazily because it is a heavy
 * dependency that only matters the moment someone actually clicks Export.
 *
 * @returns {Promise<ArrayBuffer>}
 */
export async function generateAnalyticsWorkbookBuffer({ rows, subtitle = '' } = {}) {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;

  const cols = ANALYTICS_EXPORT_COLUMNS;
  const numCols = cols.length;
  const lastCol = columnLetter(numCols);
  const data = Array.isArray(rows) ? rows : [];
  const totals = summariseExportRows(data);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LoveLab';
  wb.created = new Date();

  const ws = wb.addWorksheet('Analytics', {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  ws.getRow(1).height = 40;
  ws.mergeCells(`A1:${lastCol}1`);
  const title = ws.getCell('A1');
  title.value = '✦  LoveLab';
  title.font = { bold: true, size: 18, color: { argb: WHITE }, name: 'Calibri' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } };
  title.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  ws.getRow(2).height = 20;
  ws.mergeCells(`A2:${lastCol}2`);
  const sub = ws.getCell('A2');
  sub.value = subtitle;
  sub.font = { size: 10, color: { argb: 'FFCFAECF' }, italic: true, name: 'Calibri' };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } };
  sub.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  ws.getRow(3).height = 6;
  ws.mergeCells(`A3:${lastCol}3`);
  ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } };

  const kpis = [
    { label: 'Total Revenue', value: totals.revenue, numFmt: '"€"#,##0.00' },
    { label: 'Orders', value: totals.orderCount },
    { label: 'Quotes', value: totals.quoteCount },
    { label: 'Clients', value: totals.clientCount },
  ];
  ws.getRow(4).height = 16;
  ws.getRow(5).height = 28;
  kpis.forEach((kpi, i) => {
    const labelCell = ws.getCell(4, i + 1);
    labelCell.value = kpi.label.toUpperCase();
    labelCell.font = { size: 8, color: { argb: KPI_GRAY }, name: 'Calibri' };
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_BG } };

    const valueCell = ws.getCell(5, i + 1);
    valueCell.value = kpi.value;
    if (kpi.numFmt) valueCell.numFmt = kpi.numFmt;
    valueCell.font = { size: 14, bold: true, color: { argb: PLUM }, name: 'Calibri' };
    valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_BG } };
  });

  ws.getRow(6).height = 10;

  ws.getRow(HEADER_ROW).height = 26;
  cols.forEach((col, i) => {
    const cell = ws.getCell(HEADER_ROW, i + 1);
    cell.value = col.header.toUpperCase();
    cell.font = { bold: true, color: { argb: WHITE }, size: 9, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } };
    cell.alignment = {
      horizontal: col.numeric ? 'right' : 'left',
      vertical: 'middle',
      indent: col.numeric ? 0 : 1,
    };
    cell.border = { bottom: { style: 'medium', color: { argb: PLUM_MID } } };
    ws.getColumn(i + 1).width = col.width;
  });

  data.forEach((row, rowIdx) => {
    const rowNum = HEADER_ROW + 1 + rowIdx;
    ws.getRow(rowNum).height = 18;
    const isEven = rowIdx % 2 === 0;
    cols.forEach((col, colIdx) => {
      const cell = ws.getCell(rowNum, colIdx + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? WHITE : LIGHT_ROW } };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE8E8E8' } } };
      if (col.numeric) {
        cell.value = Number(row[col.key]) || 0;
        cell.numFmt = '"€"#,##0.00';
        cell.font = { bold: true, color: { argb: PLUM }, size: 11, name: 'Calibri' };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.value = row[col.key] ?? '';
        cell.font = { size: 10, color: { argb: TEXT_GRAY }, name: 'Calibri' };
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      }
    });
  });

  const totalsRow = HEADER_ROW + 1 + data.length;
  ws.getRow(totalsRow).height = 26;
  cols.forEach((col, colIdx) => {
    const cell = ws.getCell(totalsRow, colIdx + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } };
    cell.border = { top: { style: 'medium', color: { argb: PLUM_MID } } };
    if (col.numeric) {
      cell.value = totals.revenue;
      cell.numFmt = '"€"#,##0.00';
      cell.font = { bold: true, color: { argb: WHITE }, size: 12, name: 'Calibri' };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else if (colIdx === 0) {
      cell.value = `TOTAL  (${totals.rowCount} rows · ${totals.clientCount} clients)`;
      cell.font = { bold: true, color: { argb: WHITE }, size: 10, name: 'Calibri' };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    } else {
      cell.value = '';
    }
  });

  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: totalsRow - 1, column: numCols } };

  return wb.xlsx.writeBuffer();
}

/** 1 -> A, 26 -> Z, 27 -> AA. The reports export only handled single letters. */
export function columnLetter(index) {
  let n = index;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
