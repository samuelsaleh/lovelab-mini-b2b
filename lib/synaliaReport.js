/**
 * SYNALIA quarterly CA report — Excel builder.
 * Separate from commission reports; CA = total_amount (invoice TTC).
 */

import ExcelJS from 'exceljs';
import { getQuarterBounds, parseOrderDate } from './synaliaQuarter.js';

const PLUM = 'FF5D3A5E';
const PLUM_DARK = 'FF3F2440';
const PLUM_TINT = 'FFF1ECF2';
const ROW_ZEBRA = 'FFFAF7FB';
const TEXT_BODY = 'FF2A2A2A';
const TEXT_MUTED = 'FF8A8A8A';
const SOFT_BORDER = 'FFEDE3ED';
const WHITE = 'FFFFFFFF';
const GOLD = 'FFC5A059';

function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtToday() {
  return new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function clientKey(doc) {
  return (doc.client_company || doc.client_name || 'Client').trim();
}

/**
 * @param {{ orders: object[], year: number, quarter: number, agentName: string }} args
 */
export function buildSynaliaReportData({ orders, year, quarter, agentName }) {
  const period = getQuarterBounds(year, quarter);
  const sorted = [...(orders || [])].sort((a, b) => {
    const ck = clientKey(a).localeCompare(clientKey(b), 'fr');
    if (ck !== 0) return ck;
    return parseOrderDate(a).getTime() - parseOrderDate(b).getTime();
  });

  const groups = [];
  const groupMap = new Map();
  for (const doc of sorted) {
    const key = clientKey(doc);
    if (!groupMap.has(key)) {
      const g = { client: key, orders: [], subtotal: 0 };
      groupMap.set(key, g);
      groups.push(g);
    }
    const amount = round2(doc.total_amount);
    const row = {
      date: doc.metadata?.formState?.date || doc.created_at,
      client: key,
      reference: doc.file_name || doc.id,
      amount,
    };
    const g = groupMap.get(key);
    g.orders.push(row);
    g.subtotal = round2(g.subtotal + amount);
  }

  const grandTotal = round2(groups.reduce((s, g) => s + g.subtotal, 0));

  return {
    period,
    agentName: agentName || 'Agent',
    exportedAt: fmtToday(),
    groups,
    orderCount: sorted.length,
    clientCount: groups.length,
    grandTotal,
  };
}

/**
 * @param {{ data: ReturnType<typeof buildSynaliaReportData> }} args
 * @returns {Promise<Buffer>}
 */
export async function generateSynaliaReport({ data }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LoveLab B2B';
  const ws = wb.addWorksheet('SYNALIA', {
    views: [{ showGridLines: false }],
    properties: { defaultColWidth: 14 },
  });

  ws.columns = [
    { width: 14 },
    { width: 36 },
    { width: 32 },
    { width: 16 },
  ];

  let row = 1;
  ws.mergeCells(row, 1, row, 4);
  const titleCell = ws.getCell(row, 1);
  titleCell.value = 'LoveLab — Rapport SYNALIA';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: PLUM } };
  titleCell.fill = fill(PLUM_TINT);
  row += 1;

  ws.mergeCells(row, 1, row, 4);
  ws.getCell(row, 1).value = data.period.labelLong;
  ws.getCell(row, 1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: TEXT_BODY } };
  row += 1;

  ws.mergeCells(row, 1, row, 4);
  ws.getCell(row, 1).value = `Agent : ${data.agentName} · Exporté le ${data.exportedAt}`;
  ws.getCell(row, 1).font = { name: 'Calibri', size: 10, color: { argb: TEXT_MUTED } };
  row += 2;

  const headers = ['Date', 'Client', 'Réf. commande', 'Montant TTC (€)'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = fill(PLUM);
    cell.alignment = { horizontal: i === 3 ? 'right' : 'left', vertical: 'middle', indent: 1 };
  });
  row += 1;

  if (!data.groups.length) {
    ws.mergeCells(row, 1, row, 4);
    ws.getCell(row, 1).value = 'Aucune commande Synalia pour ce trimestre.';
    ws.getCell(row, 1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: TEXT_MUTED } };
    row += 2;
  }

  for (const group of data.groups) {
    group.orders.forEach((o, idx) => {
      const zebra = idx % 2 === 0 ? ROW_ZEBRA : WHITE;
      const cells = [fmtDate(o.date), o.client, o.reference, o.amount];
      cells.forEach((val, colIdx) => {
        const cell = ws.getCell(row, colIdx + 1);
        cell.value = val;
        cell.fill = fill(zebra);
        cell.font = { name: 'Calibri', size: 10, color: { argb: TEXT_BODY } };
        cell.border = { bottom: { style: 'hair', color: { argb: SOFT_BORDER } } };
        if (colIdx === 3) {
          cell.numFmt = '#,##0.00 "€"';
          cell.alignment = { horizontal: 'right' };
        }
      });
      row += 1;
    });

    ws.mergeCells(row, 1, row, 3);
    ws.getCell(row, 1).value = `Sous-total — ${group.client}`;
    ws.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: PLUM_DARK } };
    ws.getCell(row, 1).fill = fill(PLUM_TINT);
    const subCell = ws.getCell(row, 4);
    subCell.value = group.subtotal;
    subCell.numFmt = '#,##0.00 "€"';
    subCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PLUM_DARK } };
    subCell.fill = fill(PLUM_TINT);
    subCell.alignment = { horizontal: 'right' };
    row += 2;
  }

  ws.mergeCells(row, 1, row, 3);
  ws.getCell(row, 1).value = 'TOTAL CA SYNALIA';
  ws.getCell(row, 1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: WHITE } };
  ws.getCell(row, 1).fill = fill(PLUM_DARK);
  const totalCell = ws.getCell(row, 4);
  totalCell.value = data.grandTotal;
  totalCell.numFmt = '#,##0.00 "€"';
  totalCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: GOLD } };
  totalCell.fill = fill(PLUM_DARK);
  totalCell.alignment = { horizontal: 'right' };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function synaliaReportFilename(agentName, year, quarter) {
  const safe = String(agentName || 'Agent').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ');
  return `${safe} - SYNALIA T${quarter} ${year}.xlsx`;
}
