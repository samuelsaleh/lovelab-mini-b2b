/**
 * Phase B / B2 — sample monthly Excel report.
 *
 * Picks an agent (default: the one with the most ready-to-pay commissions
 * inside the chosen window), pulls their `agent_commissions` rows + the
 * joined documents, and writes a real .xlsx to disk so we can eyeball the
 * design before we wire up automation.
 *
 * Usage:
 *   node scripts/test-commission-report.mjs
 *     # → writes ./tmp/commission-report-<agent>-<period>.xlsx
 *
 *   node scripts/test-commission-report.mjs --agent <agent_id>
 *     # → restrict to a specific agent
 *
 *   node scripts/test-commission-report.mjs --month 2026-04
 *     # → choose the period (YYYY-MM, defaults to last calendar month)
 *
 *   node scripts/test-commission-report.mjs --month 2026-04 --include-all
 *     # → DEMO MODE: include every commission of the month even if
 *       customer_paid_at is null. Useful right now because Nicolas's
 *       checkboxes haven't been ticked yet — you still see the layout.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReportData, generateCommissionReport } from '../lib/commissionReport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

// Auto-load .env.local then .env (Node 20+).
for (const f of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(REPO, f));
  } catch {
    /* file missing — ignore */
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

// ── argv ────────────────────────────────────────────────────────────────
function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  const next = process.argv[idx + 1];
  return next && !next.startsWith('--') ? next : true;
}
const arg = {
  agent: getArg('agent'),
  month: getArg('month'),
  includeAll: !!getArg('include-all'),
};

// ── Period: previous calendar month (Brussels-naive but UTC-comparable) ─
function periodForMonth(yyyymm) {
  let y, m;
  if (yyyymm) {
    const match = String(yyyymm).match(/^(\d{4})-(\d{2})$/);
    if (!match) throw new Error(`--month must be YYYY-MM, got "${yyyymm}"`);
    y = Number(match[1]);
    m = Number(match[2]);
  } else {
    const now = new Date();
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    y = last.getUTCFullYear();
    m = last.getUTCMonth() + 1;
  }
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)); // last day of m
  return { start, end, label: `${y}-${String(m).padStart(2, '0')}` };
}

const period = periodForMonth(arg.month);
console.log(`📅 Period: ${period.start.toISOString()} → ${period.end.toISOString()}`);
console.log(`🔧 Mode:   ${arg.includeAll ? 'DEMO (include all commissions of the month)' : 'STRICT (only customer_paid_at in window)'}`);

// ── Pick agent ──────────────────────────────────────────────────────────
async function pickAgent() {
  if (typeof arg.agent === 'string') {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, commission_rate, new_client_bonus_enabled, new_client_bonus_amount, role')
      .eq('id', arg.agent)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Agent ${arg.agent} not found`);
    return data;
  }
  // Default: agent with the most non-cancelled commissions in the window.
  const { data: comms, error } = await supabase
    .from('agent_commissions')
    .select('agent_id')
    .neq('status', 'cancelled')
    .gte('created_at', period.start.toISOString())
    .lte('created_at', period.end.toISOString());
  if (error) throw error;
  const counts = new Map();
  for (const c of comms || []) counts.set(c.agent_id, (counts.get(c.agent_id) || 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) throw new Error('No commissions found in window. Pass --agent <id> or change --month.');
  const { data: agent, error: agentErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, commission_rate, new_client_bonus_enabled, new_client_bonus_amount, role')
    .eq('id', top[0])
    .maybeSingle();
  if (agentErr) throw agentErr;
  if (!agent) throw new Error(`Top agent ${top[0]} not found in profiles`);
  return agent;
}

// ── Fetch commissions + joined documents ────────────────────────────────
async function fetchCommissions(agentId) {
  // Pull every non-cancelled commission for the agent. The actual window
  // filter happens in buildReportData() which checks customer_paid_at,
  // not created_at — fetching a wider set here is safe and avoids cases
  // where an order from March was customer-paid in May.
  const { data, error } = await supabase
    .from('agent_commissions')
    .select(`
      id, type, status, commission_rate, commission_amount, order_total,
      created_at, customer_paid_at, document_id,
      document:documents (
        id, client_name, client_company, total_amount, order_channel, metadata, created_at
      )
    `)
    .eq('agent_id', agentId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  if (error) throw error;

  if (arg.includeAll) {
    // DEMO: pretend every commission of the month was customer-paid on the
    // commission's created_at, just so the export window catches it.
    return (data || []).map((c) => ({
      ...c,
      customer_paid_at: c.customer_paid_at || c.created_at,
    }));
  }
  return data || [];
}

// ── Logo bytes ──────────────────────────────────────────────────────────
function loadLogo() {
  const p = path.join(REPO, 'public', 'logo.png');
  if (!fs.existsSync(p)) {
    console.warn(`⚠️  ${p} not found — proceeding without logo.`);
    return null;
  }
  return fs.readFileSync(p);
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const agent = await pickAgent();
  console.log(`👤 Agent:  ${agent.full_name || agent.email} (${agent.id})`);
  console.log(`💰 Rate:   ${agent.commission_rate || 0}%   New-client bonus: ${agent.new_client_bonus_enabled ? `€${agent.new_client_bonus_amount || 0} (ON)` : 'OFF'}`);

  const commissions = await fetchCommissions(agent.id);
  console.log(`📦 Pulled ${commissions.length} commission row(s) from Supabase.`);

  const data = buildReportData({
    agent,
    commissions,
    periodStart: period.start,
    periodEnd: period.end,
    includeLooseSales: true,
  });

  console.log('');
  console.log('📊 Shaped report:');
  console.log(`   Orders:     ${data.totals.orderCount}`);
  console.log(`   Customers:  ${data.totals.customerCount}`);
  console.log(`   Bonuses:    ${data.totals.bonusCount}`);
  console.log(`   Loose B2C:  ${data.totals.looseSalesCount}`);
  console.log(`   Net total:  €${data.totals.netTotal.toFixed(2)}`);
  console.log(`   Commission: €${data.totals.commissionTotal.toFixed(2)}`);
  console.log(`   Bonus:      €${data.totals.bonusTotal.toFixed(2)}`);
  console.log(`   Loose sub:  €${data.totals.looseSalesTotal.toFixed(2)}`);
  console.log(`   GRAND:      €${data.totals.grandTotal.toFixed(2)}`);
  console.log('');

  const logo = loadLogo();
  const buffer = await generateCommissionReport({ data, logoBuffer: logo, demoMode: arg.includeAll });

  const outDir = path.join(REPO, 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const safeName = (agent.full_name || agent.email || 'agent').replace(/[^a-zA-Z0-9]+/g, '_');
  const fname = `commission-report-${safeName}-${period.label}.xlsx`;
  const out = path.join(outDir, fname);
  fs.writeFileSync(out, buffer);

  console.log(`✅ Wrote ${out}`);
  console.log(`   Open it with:  open "${out}"`);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
