/**
 * Phase B / B2 — showcase Excel.
 *
 * Builds the report against a synthetic but realistic dataset so every
 * section (orders, new-client bonuses, loose B2C, customer summary,
 * grand total) is populated. Lets us judge the design before hooking up
 * the live monthly automation.
 *
 * Usage:  node scripts/test-commission-report-showcase.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReportData, generateCommissionReport } from '../lib/commissionReport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

const PERIOD_START = '2026-04-01T00:00:00.000Z';
const PERIOD_END = '2026-04-30T23:59:59.999Z';

// Synthetic agent + commissions resembling Nicolas's typical month with
// a mix of B2B orders, a new-client bonus, a B2C loose sale, and a
// fuzzy-name duplicate so the customer summary collapses correctly.
const agent = {
  id: 'agent-demo',
  full_name: 'Nicolas Vial',
  email: 'nicolas@love-lab.com',
  commission_rate: 15,
};

const commissions = [
  // ── B2B orders (commission rate × net) ─────────────────────────────
  {
    id: 'c1',
    type: 'order',
    status: 'pending',
    commission_rate: 15,
    commission_amount: 372.75,
    order_total: 2485,
    created_at: '2026-04-30T16:22:00Z',
    customer_paid_at: '2026-04-30T17:00:00Z',
    document: {
      id: 'doc-1',
      client_name: 'Mme Descours',
      client_company: 'SARL DESCOURS1893',
      total_amount: 2485,
      order_channel: 'b2b',
    },
  },
  {
    id: 'c2',
    type: 'order',
    status: 'pending',
    commission_rate: 15,
    commission_amount: 346.5,
    order_total: 2310,
    created_at: '2026-04-30T09:21:00Z',
    customer_paid_at: '2026-04-30T15:00:00Z',
    document: {
      id: 'doc-2',
      client_name: 'M. Gina',
      client_company: 'SARL GINA',
      total_amount: 2310,
      order_channel: 'b2b',
    },
  },
  {
    id: 'c3',
    type: 'order',
    status: 'pending',
    commission_rate: 15,
    commission_amount: 340.5,
    order_total: 2270,
    created_at: '2026-04-02T09:19:00Z',
    customer_paid_at: '2026-04-15T11:30:00Z',
    document: {
      id: 'doc-3',
      client_name: 'Mme Eyglunent',
      client_company: 'SARL EYGLUNENT-CHAULAN',
      total_amount: 2330,
      order_channel: 'b2b',
    },
  },
  // ── Repeat customer with a fuzzy name (collapses with c5) ──────────
  {
    id: 'c4',
    type: 'order',
    status: 'pending',
    commission_rate: 15,
    commission_amount: 90.0,
    order_total: 600,
    created_at: '2026-04-12T14:00:00Z',
    customer_paid_at: '2026-04-22T09:00:00Z',
    document: {
      id: 'doc-4',
      client_name: 'Mme Lefebvre',
      client_company: 'SAS Little Factory',
      total_amount: 620,
      order_channel: 'b2b',
    },
  },
  {
    id: 'c5',
    type: 'order',
    status: 'pending',
    commission_rate: 15,
    commission_amount: 60.0,
    order_total: 400,
    created_at: '2026-04-25T10:00:00Z',
    customer_paid_at: '2026-04-28T16:00:00Z',
    document: {
      id: 'doc-5',
      client_name: 'Mme Lefebvre',
      client_company: 'Little Factory',
      total_amount: 400,
      order_channel: 'b2b',
    },
  },
  // ── New-client bonus (€200, paid once for Little Factory) ──────────
  {
    id: 'b1',
    type: 'new_client_bonus',
    status: 'pending',
    commission_rate: 0,
    commission_amount: 200,
    order_total: 0,
    created_at: '2026-04-12T14:00:30Z',
    customer_paid_at: '2026-04-22T09:00:00Z',
    document: {
      id: 'doc-4',
      client_name: 'Mme Lefebvre',
      client_company: 'SAS Little Factory',
      order_channel: 'b2b',
    },
  },
  // ── Loose B2C sale (the website attributed an order to this agent) ─
  {
    id: 'c6',
    type: 'order',
    status: 'pending',
    commission_rate: 15,
    commission_amount: 22.5,
    order_total: 150,
    created_at: '2026-04-18T11:00:00Z',
    customer_paid_at: '2026-04-18T11:00:30Z',
    document: {
      id: 'doc-6',
      client_name: 'M. Dupont',
      client_company: '',
      total_amount: 165,
      order_channel: 'b2c',
    },
  },
  // ── Cancelled order — must be invisible ────────────────────────────
  {
    id: 'c7',
    type: 'order',
    status: 'cancelled',
    commission_rate: 15,
    commission_amount: 600,
    order_total: 4000,
    created_at: '2026-04-10T09:00:00Z',
    customer_paid_at: '2026-04-12T09:00:00Z',
    document: {
      id: 'doc-7',
      client_name: 'Cancelled Co',
      client_company: 'CANCELLED Co',
      total_amount: 4000,
      order_channel: 'b2b',
    },
  },
  // ── Already-paid order — must be invisible (in a previous report) ──
  {
    id: 'c8',
    type: 'order',
    status: 'paid',
    commission_rate: 15,
    commission_amount: 75,
    order_total: 500,
    created_at: '2026-04-05T09:00:00Z',
    customer_paid_at: '2026-04-06T09:00:00Z',
    document: {
      id: 'doc-8',
      client_name: 'Already Paid',
      client_company: 'PaidPrev SARL',
      total_amount: 500,
      order_channel: 'b2b',
    },
  },
  // ── Awaiting customer (no customer_paid_at) — must be invisible ────
  {
    id: 'c9',
    type: 'order',
    status: 'pending',
    commission_rate: 15,
    commission_amount: 150,
    order_total: 1000,
    created_at: '2026-04-20T09:00:00Z',
    customer_paid_at: null,
    document: {
      id: 'doc-9',
      client_name: 'Awaiting Co',
      client_company: 'AWAITING SARL',
      total_amount: 1000,
      order_channel: 'b2b',
    },
  },
];

const data = buildReportData({
  agent,
  commissions,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  includeLooseSales: true,
});

console.log('📊 Showcase report:');
console.log(`   Orders:     ${data.totals.orderCount}    (expected 5: 4 B2B incl. fuzzy-merged + 0 B2C in this section)`);
console.log(`   Loose B2C:  ${data.totals.looseSalesCount}    (expected 1)`);
console.log(`   Bonuses:    ${data.totals.bonusCount}    (expected 1)`);
console.log(`   Customers:  ${data.totals.customerCount}    (expected 4: SAS + Little Factory collapse, plus the loose B2C M. Dupont)`);
console.log(`   Grand:      €${data.totals.grandTotal.toFixed(2)}`);
console.log('');

const logoPath = path.join(REPO, 'public', 'logo.png');
const logo = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;
const buffer = await generateCommissionReport({ data, logoBuffer: logo, demoMode: false });

const outDir = path.join(REPO, 'tmp');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'commission-report-SHOWCASE-2026-04.xlsx');
fs.writeFileSync(out, buffer);

console.log(`✅ Wrote ${out}`);
console.log(`   Open it with:  open "${out}"`);
