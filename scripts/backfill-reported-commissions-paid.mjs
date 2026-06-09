/**
 * One-shot: mark commissions as paid out when they were already included
 * in a sent commission report but still show as "Ready" on the agent page.
 *
 * Run after wiring report generation → markCommissionsPaidOut().
 *
 * Usage:
 *   node scripts/backfill-reported-commissions-paid.mjs
 *   node scripts/backfill-reported-commissions-paid.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  markCommissionsPaidOut,
  resolveCommissionIdsForReport,
} from '../lib/commissionPaidOut.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch {}
}

const DRY = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: reports, error } = await supabase
  .from('commission_reports')
  .select('id, agent_id, period_label, period_key, created_at, snapshot_data, total_due')
  .gt('total_due', 0)
  .order('created_at', { ascending: true });

if (error) {
  console.error('Failed to load commission reports:', error.message);
  process.exit(1);
}

console.log(`📋 ${reports.length} commission report(s) with total_due > 0.`);

let totalMarked = 0;
let reportsTouched = 0;

for (const report of reports || []) {
  let ids = [];
  try {
    ids = await resolveCommissionIdsForReport(supabase, report);
  } catch (err) {
    console.warn(`  ⚠ ${report.period_label || report.id}: ${err.message}`);
    continue;
  }

  if (ids.length === 0) continue;

  const { data: stillPending } = await supabase
    .from('agent_commissions')
    .select('id, commission_amount, type')
    .in('id', ids)
    .in('status', ['pending', 'approved']);

  if (!stillPending?.length) continue;

  const pendingIds = stillPending.map((r) => r.id);
  const sum = stillPending.reduce((s, r) => s + Number(r.commission_amount || 0), 0);

  console.log(
    `  → ${report.period_label || report.period_key} (${report.id.slice(0, 8)}…): `
    + `${pendingIds.length} row(s), €${sum.toFixed(2)}`,
  );

  if (DRY) {
    reportsTouched += 1;
    totalMarked += pendingIds.length;
    continue;
  }

  const paidAt = report.created_at || new Date().toISOString();
  const { marked } = await markCommissionsPaidOut(supabase, pendingIds, { paidAt });
  if (marked > 0) {
    reportsTouched += 1;
    totalMarked += marked;
  }
}

console.log(
  DRY
    ? `\n✅ Dry run complete — would mark ${totalMarked} commission(s) across ${reportsTouched} report(s).`
    : `\n✅ Marked ${totalMarked} commission(s) paid out across ${reportsTouched} report(s).`,
);
