#!/usr/bin/env node
/**
 * One-off inspector. Prints details of the columns / tables that exist in
 * production but were never tracked in a migration file in this repo. Used
 * by Phase 0.5b to write a faithful "codify existing schema" migration.
 *
 * Read-only.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');

try {
  const raw = readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
} catch {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function inspect() {
  // 1. Confirm audit_state exists and dump its columns.
  const cols = await supabase.rpc('__schema_drift_columns');
  if (cols.error) throw cols.error;
  const targetTables = ['audit_state', 'events', 'profiles'];
  for (const t of targetTables) {
    const tableCols = (cols.data || []).filter((c) => c.table_name === t);
    if (tableCols.length === 0) {
      console.log(`Table ${t}: NOT PRESENT`);
      continue;
    }
    console.log(`\nTable public.${t}:`);
    for (const c of tableCols) {
      if (t === 'events' && c.column_name !== 'type') continue;
      if (t === 'profiles' && !['agent_deleted_at', 'agent_contract_url'].includes(c.column_name)) continue;
      if (t === 'audit_state' || ['type', 'agent_deleted_at', 'agent_contract_url'].includes(c.column_name)) {
        console.log(`  - ${c.column_name.padEnd(28)} ${c.data_type.padEnd(30)} default=${c.column_default ?? 'NULL'} nullable=${c.is_nullable}`);
      }
    }
  }

  // 2. Distinct values of events.type so we can write a CHECK constraint.
  const { data: evtTypes, error: evtErr } = await supabase
    .from('events')
    .select('type')
    .not('type', 'is', null);
  if (!evtErr && evtTypes) {
    const set = new Set(evtTypes.map((r) => r.type));
    console.log('\nDistinct events.type values:', [...set].sort());
  } else if (evtErr) {
    console.log('\nevents.type query failed:', evtErr.message);
  }

  // 3. Indexes on these tables.
  const idx = await supabase.rpc('__schema_drift_indexes');
  if (!idx.error) {
    const interesting = (idx.data || []).filter((i) =>
      ['audit_state', 'events', 'profiles'].includes(i.tablename) &&
      (i.indexdef.includes('type') || i.indexdef.includes('agent_deleted_at') || i.indexdef.includes('agent_contract_url') || i.tablename === 'audit_state'),
    );
    console.log('\nRelevant indexes:');
    for (const i of interesting) console.log(`  - ${i.indexname}: ${i.indexdef}`);
  }

  // 4. Constraints on these tables.
  const con = await supabase.rpc('__schema_drift_constraints');
  if (!con.error) {
    const interesting = (con.data || []).filter((c) =>
      ['audit_state', 'events'].includes(c.table_name) ||
      (c.table_name === 'profiles' && (c.constraint_name.includes('agent_deleted') || c.constraint_name.includes('agent_contract'))),
    );
    console.log('\nRelevant constraints:');
    for (const c of interesting) console.log(`  - ${c.table_name}.${c.constraint_name} (${c.constraint_type})`);
  }
}

inspect().catch((e) => { console.error(e); process.exit(1); });
