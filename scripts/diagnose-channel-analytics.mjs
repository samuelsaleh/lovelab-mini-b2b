/**
 * Diagnostic — can I trust the numbers on /analytics?
 * READ-ONLY. Run: node scripts/diagnose-channel-analytics.mjs
 *
 * Pulls every document + event straight from Supabase, recomputes what
 * AnalyticsDashboard shows using the very same helpers the dashboard imports
 * (lib/vitrines, lib/collectionMatch, lib/countries), and reports each place
 * where a number on screen is a floor, an estimate, or silently incomplete.
 *
 * All logic lives in lib/analyticsAudit.js and is unit-tested; this file only
 * fetches and prints.
 *
 * Exit code 1 when a check FAILS (data inconsistency), 0 otherwise.
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAnalyticsAudit } from '../lib/analyticsAudit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch {}
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local or .env');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const STEP = 1000;
const DOC_FIELDS = [
  'id', 'document_type', 'order_channel', 'status', 'total_amount',
  'client_company', 'client_name', 'event_id', 'created_at', 'deleted_at', 'metadata',
];

/** Page through a table, tolerating a missing optional column. */
async function fetchAll(table, fields, order = 'created_at') {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(fields.join(', '))
      .order(order, { ascending: true })
      .range(from, from + STEP - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < STEP) break;
    from += STEP;
  }
  return rows;
}

async function fetchDocuments() {
  // documents.agent_id only exists once the selling-agent migration ran.
  try {
    return { docs: await fetchAll('documents', [...DOC_FIELDS, 'agent_id']), hasAgentColumn: true };
  } catch (err) {
    if (!/agent_id/.test(err.message)) throw err;
    console.log('note: documents.agent_id not present — skipping the agent-coverage detail\n');
    return { docs: await fetchAll('documents', DOC_FIELDS), hasAgentColumn: false };
  }
}

// ─── Fetch ──────────────────────────────────────────────────────────────────
const [{ docs, hasAgentColumn }, events] = await Promise.all([
  fetchDocuments(),
  fetchAll('events', ['id', 'name', 'type'], 'created_at'),
]);

// ─── Audit ──────────────────────────────────────────────────────────────────
const { checks, summary, totals } = runAnalyticsAudit({ documents: docs, events });

const ICON = { ok: 'PASS', info: 'NOTE', warn: 'WARN', fail: 'FAIL' };
const BAR = '─'.repeat(74);

console.log(BAR);
console.log('ANALYTICS ACCURACY AUDIT');
console.log(BAR);
console.log(`documents in database : ${totals.rawDocuments}`);
console.log(`counted by analytics  : ${totals.countedDocuments}  (drafts, trashed, internal/consignment/write-off removed)`);
console.log(`events / folders      : ${events.length}`);
console.log(`order revenue         : EUR ${totals.revenue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`);
if (!hasAgentColumn) console.log('agent_id column       : absent');
console.log('');

for (const c of checks) {
  if (c.id === 'agent-coverage' && !hasAgentColumn) continue;
  console.log(`[${ICON[c.status] || c.status}] ${c.title}`);
  console.log(`       ${c.headline}`);
  for (const line of c.details) console.log(`       ${line}`);
  console.log('');
}

console.log(BAR);
console.log(`${summary.ok} passed · ${summary.info} notes · ${summary.warn} warnings · ${summary.fail} failures`);
console.log(BAR);

if (summary.fail > 0) process.exit(1);
