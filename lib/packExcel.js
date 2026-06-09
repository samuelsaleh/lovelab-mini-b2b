/**
 * lib/packExcel.js — single source of the LoveLab "order template" Excel layout.
 *
 * Generalises the old scripts/generate-pack4.mjs so any pack (its `label` +
 * `form_rows`) renders to the same branded 13-column order sheet. Used by the
 * pack-template storage helper (lib/packTemplates.js) for create/update hooks,
 * the download route, and the backfill script.
 *
 * ExcelJS is imported dynamically so the heavy dependency only loads in the
 * Node serverless runtime when a template is actually generated (lean cold
 * starts on the rest of the pack API).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Cache the logo bytes so we don't hit disk on every generation. Mirrors
// lib/commissionReportService.loadLogo so both exports look identical.
let _logoCache;
async function loadLogo() {
  if (_logoCache !== undefined) return _logoCache;
  try {
    _logoCache = await readFile(path.join(process.cwd(), 'public', 'logo.png'));
  } catch {
    // Logo embedding is best-effort — fall back to the text wordmark.
    _logoCache = null;
  }
  return _logoCache;
}

// ── Brand colours (match ReportsDashboard + the legacy pack templates) ──────
const PLUM = 'FF5D3A5E';
const PLUM_DARK = 'FF4A2545';
const WHITE = 'FFFFFFFF';
const LIGHT_ROW = 'FFFFF9FF';
const ALT_ROW = 'FFF5EFF5';
const TEXT_GRAY = 'FF4F4F4F';

const COLUMNS = [
  { header: 'Collection', key: 'collection', width: 22 },
  { header: 'Carat', key: 'carat', width: 10 },
  { header: 'Shape', key: 'shape', width: 14 },
  { header: 'Housing', key: 'bpColor', width: 12 },
  { header: 'Setting', key: 'setting', width: 12 },
  { header: 'Size', key: 'size', width: 8 },
  { header: 'Cord Color', key: 'colorCord', width: 16 },
  { header: 'Qty', key: 'quantity', width: 8 },
  { header: 'Unit Price €', key: 'unitPrice', width: 14 },
  { header: 'Total €', key: 'total', width: 12 },
  { header: 'Cert', key: 'cert', width: 10 },
  { header: 'Reference', key: 'reference', width: 20 },
  { header: 'Notes', key: 'notes', width: 24 },
];

const NUM_COLS = COLUMNS.length;
const LAST_COL_LETTER = String.fromCharCode(64 + NUM_COLS);

function border(color = PLUM) {
  const s = { style: 'thin', color: { argb: color } };
  return { top: s, left: s, bottom: s, right: s };
}

// Unique collection labels in first-seen order, for the subtitle strip.
function uniqueCollections(rows) {
  const seen = [];
  for (const r of rows) {
    const c = (r?.collection || '').trim();
    if (c && !seen.includes(c)) seen.push(c);
  }
  return seen;
}

/**
 * Build the order-template workbook for a pack and return it as a Buffer.
 *
 * @param {object} pack
 * @param {string} pack.label      — display label (e.g. "Pack 1", "PACK 6-RB-SYN")
 * @param {Array<object>} pack.form_rows — pack line items
 * @returns {Promise<Buffer>}
 */
export async function generatePackExcelBuffer(pack) {
  const ExcelJS = (await import('exceljs')).default;

  const label = (pack?.label || 'Pack').toString().trim() || 'Pack';
  const rows = Array.isArray(pack?.form_rows) ? pack.form_rows : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LoveLab';
  wb.created = new Date();

  // Worksheet names can't exceed 31 chars or contain []*?/\: — keep it safe.
  const sheetName = `${label} Order`.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 8 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  ws.columns = COLUMNS.map((c) => ({ width: c.width }));

  // ── Row 1: Brand title bar ────────────────────────────────────────────────
  ws.getRow(1).height = 46;
  ws.mergeCells(`A1:${LAST_COL_LETTER}1`);
  const titleCell = ws.getCell('A1');
  titleCell.font = { bold: true, size: 20, color: { argb: WHITE }, name: 'Calibri' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } };

  // Embed the real LoveLab logo (best-effort). When present, the wordmark text
  // is indented to clear it; otherwise we fall back to the ✦ glyph wordmark.
  const logoBuffer = await loadLogo();
  if (logoBuffer) {
    try {
      const imageId = wb.addImage({ buffer: logoBuffer, extension: 'png' });
      ws.addImage(imageId, {
        tl: { col: 0.15, row: 0.12 },
        ext: { width: 40, height: 40 },
        editAs: 'oneCell',
      });
      titleCell.value = '      LoveLab';
      titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
    } catch {
      titleCell.value = '\u2726  LoveLab';
      titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
    }
  } else {
    titleCell.value = '\u2726  LoveLab';
    titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
  }

  // ── Row 2: Pack subtitle ──────────────────────────────────────────────────
  ws.getRow(2).height = 20;
  ws.mergeCells(`A2:${LAST_COL_LETTER}2`);
  const collections = uniqueCollections(rows);
  const subCell = ws.getCell('A2');
  subCell.value = collections.length
    ? `Order Template \u2014 ${label}   \u00b7   ${collections.join(' \u00b7 ')}`
    : `Order Template \u2014 ${label}`;
  subCell.font = { size: 10, color: { argb: 'FFCFAECF' }, italic: true, name: 'Calibri' };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } };
  subCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };

  // ── Row 3: Plum spacer ────────────────────────────────────────────────────
  ws.getRow(3).height = 6;
  ws.mergeCells(`A3:${LAST_COL_LETTER}3`);
  ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } };

  // ── Row 4: Client info labels ─────────────────────────────────────────────
  ws.getRow(4).height = 16;
  const infoLabels = ['Client / Company', 'Contact Name', 'Date', 'PO / Ref'];
  infoLabels.forEach((labelText, i) => {
    const cell = ws.getCell(4, i * 3 + 1);
    cell.value = labelText.toUpperCase();
    cell.font = { size: 8, color: { argb: '8A6A7D' }, name: 'Calibri', bold: true };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7FF' } };
    if (i < infoLabels.length - 1 && i * 3 + 3 <= NUM_COLS) {
      ws.mergeCells(4, i * 3 + 1, 4, Math.min(i * 3 + 3, NUM_COLS));
    }
  });

  // ── Row 5: Client info input cells ────────────────────────────────────────
  ws.getRow(5).height = 22;
  const infoMerges = [[1, 3], [4, 6], [7, 9], [10, 12]];
  infoMerges.forEach(([s, e]) => {
    if (e <= NUM_COLS) ws.mergeCells(5, s, 5, Math.min(e, NUM_COLS));
    const cell = ws.getCell(5, s);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBF8FF' } };
    cell.border = border('FFD8C8D8');
    cell.font = { size: 10, name: 'Calibri', color: { argb: TEXT_GRAY } };
    cell.alignment = { vertical: 'middle', indent: 1 };
  });

  // ── Row 6: Spacer ─────────────────────────────────────────────────────────
  ws.getRow(6).height = 8;
  ws.mergeCells(`A6:${LAST_COL_LETTER}6`);
  ws.getCell('A6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0E8F0' } };

  // ── Row 7: Instructions ───────────────────────────────────────────────────
  ws.getRow(7).height = 16;
  ws.mergeCells(`A7:${LAST_COL_LETTER}7`);
  const instrCell = ws.getCell('A7');
  instrCell.value = `Fill in Qty and Reference columns. All other fields are pre-filled for ${label}. Send to your LoveLab representative.`;
  instrCell.font = { size: 9, color: { argb: '8A6A7D' }, italic: true, name: 'Calibri' };
  instrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F0F7' } };
  instrCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };

  // ── Row 8: Column headers ─────────────────────────────────────────────────
  ws.getRow(8).height = 24;
  COLUMNS.forEach((col, i) => {
    const cell = ws.getCell(8, i + 1);
    cell.value = col.header;
    cell.font = { bold: true, size: 10, color: { argb: WHITE }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border('FF7A4F7C');
  });

  // ── Data rows ─────────────────────────────────────────────────────────────
  const FIRST_DATA_ROW = 9;
  let prevCollection = null;
  rows.forEach((row, i) => {
    const excelRow = FIRST_DATA_ROW + i;
    const isAlt = i % 2 === 1;
    const bgColor = isAlt ? ALT_ROW : LIGHT_ROW;
    const isNewSection = row.collection !== prevCollection;
    prevCollection = row.collection;

    const topBorderStyle = isNewSection
      ? { style: 'medium', color: { argb: PLUM } }
      : { style: 'thin', color: { argb: 'FFE0D0E0' } };

    const values = [
      row.collection || '',
      row.carat ? `${row.carat} ct` : '',
      row.shape || '',
      row.bpColor || '',
      row.setting || '',
      row.size || '',
      row.colorCord || '',
      Number(row.quantity) || 1,
      Number(row.unitPrice) || 0,
      { formula: `H${excelRow}*I${excelRow}` },
      row.cert || '',
      '',
      '',
    ];

    const wsRow = ws.getRow(excelRow);
    wsRow.height = 20;
    values.forEach((val, ci) => {
      const cell = ws.getCell(excelRow, ci + 1);
      cell.value = val;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.font = { size: 10, name: 'Calibri', color: { argb: TEXT_GRAY } };
      cell.border = {
        top: topBorderStyle,
        left: { style: 'thin', color: { argb: 'FFE0D0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0D0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0D0E0' } },
      };
      if (ci === 7 || ci === 8 || ci === 9) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (ci === 8 || ci === 9) cell.numFmt = '\u20ac#,##0.00';
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      }
    });
  });

  // ── Totals row ────────────────────────────────────────────────────────────
  const totalRow = FIRST_DATA_ROW + rows.length;
  ws.getRow(totalRow).height = 26;
  const totalLabel = ws.getCell(totalRow, 1);
  ws.mergeCells(totalRow, 1, totalRow, 7);
  totalLabel.value = 'TOTAL ORDER VALUE';
  totalLabel.font = { bold: true, size: 11, color: { argb: WHITE }, name: 'Calibri' };
  totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } };
  totalLabel.alignment = { horizontal: 'right', vertical: 'middle', indent: 2 };

  const lastDataRow = totalRow - 1;
  const hasRows = rows.length > 0;

  const qtyTotalCell = ws.getCell(totalRow, 8);
  qtyTotalCell.value = hasRows ? { formula: `SUM(H${FIRST_DATA_ROW}:H${lastDataRow})` } : 0;
  qtyTotalCell.font = { bold: true, size: 11, color: { argb: WHITE }, name: 'Calibri' };
  qtyTotalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } };
  qtyTotalCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const upCell = ws.getCell(totalRow, 9);
  upCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } };

  const grandTotalCell = ws.getCell(totalRow, 10);
  grandTotalCell.value = hasRows ? { formula: `SUM(J${FIRST_DATA_ROW}:J${lastDataRow})` } : 0;
  grandTotalCell.numFmt = '\u20ac#,##0.00';
  grandTotalCell.font = { bold: true, size: 13, color: { argb: WHITE }, name: 'Calibri' };
  grandTotalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } };
  grandTotalCell.alignment = { horizontal: 'center', vertical: 'middle' };
  grandTotalCell.border = border(WHITE);

  for (let c = 11; c <= NUM_COLS; c++) {
    ws.getCell(totalRow, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } };
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerRow = totalRow + 2;
  ws.mergeCells(`A${footerRow}:${LAST_COL_LETTER}${footerRow}`);
  const footer = ws.getCell(`A${footerRow}`);
  footer.value = 'LoveLab  \u00b7  hello@love-lab.com  \u00b7  Generated by LoveLab B2B Platform';
  footer.font = { size: 8, color: { argb: 'FFCCAACC' }, italic: true, name: 'Calibri' };
  footer.alignment = { horizontal: 'center', vertical: 'middle' };

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
}

export const PACK_EXCEL_COLUMNS = COLUMNS;
