#!/usr/bin/env node
/**
 * Schema drift checker.
 *
 * Compares the live Supabase schema against `lib/expected-schema.js` and
 * reports anything missing, mistyped, or unexpected.
 *
 * Read-only — issues no DDL. Safe to run any time, including in CI.
 *
 * Usage:
 *   node scripts/check-schema-drift.mjs                # human-readable report
 *   node scripts/check-schema-drift.mjs --json         # machine-readable JSON
 *   node scripts/check-schema-drift.mjs --strict       # exit 1 on any drift
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in env
 * (already in .env for the project).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

import { expectedSchema, expectedTypeMatches } from '../lib/expected-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');

function loadEnvFile(path) {
  try {
    const raw = readFileSync(path, 'utf8');
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
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

loadEnvFile(ENV_PATH);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Set them in .env or shell env, then re-run.');
  process.exit(2);
}

const argv = new Set(process.argv.slice(2));
const asJson = argv.has('--json');
const strict = argv.has('--strict');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/**
 * Helper: run a SQL query through the postgres-meta endpoint via supabase-js
 * by hitting the rpc('execute_sql') extension is not available here, so we
 * use the rest API on the information_schema views directly.
 */

async function rpc(fnName) {
  const { data, error } = await supabase.rpc(fnName);
  if (error) {
    const msg = error.message || JSON.stringify(error);
    if (/not exist|not found|could not find|404/i.test(msg)) {
      const helperPath = 'database-migrations/schema-drift-helpers.sql';
      throw new Error(
        `RPC ${fnName} is missing. Run ${helperPath} once in the Supabase SQL editor.`,
      );
    }
    throw new Error(`RPC ${fnName} failed: ${msg}`);
  }
  return data || [];
}

async function fetchTables() {
  const rows = await rpc('__schema_drift_tables');
  return new Set(rows.map((r) => r.table_name));
}

async function fetchColumns() {
  const rows = await rpc('__schema_drift_columns');
  const map = new Map();
  for (const row of rows) {
    const key = row.table_name;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

async function fetchConstraints() {
  return await rpc('__schema_drift_constraints');
}

async function fetchIndexes() {
  try {
    return await rpc('__schema_drift_indexes');
  } catch {
    return null;
  }
}

async function fetchFunctions() {
  try {
    return await rpc('__schema_drift_functions');
  } catch {
    return null;
  }
}

function buildReport({ liveTables, liveColumns, liveConstraints, liveIndexes, liveFunctions }) {
  const issues = [];

  for (const table of expectedSchema.tables) {
    if (!liveTables.has(table.name)) {
      issues.push({
        severity: 'critical',
        kind: 'missing_table',
        table: table.name,
        message: `Table public.${table.name} is missing from the live database.`,
      });
      continue;
    }

    const liveColsArr = liveColumns.get(table.name) || [];
    const liveColsByName = new Map(liveColsArr.map((c) => [c.column_name, c]));

    for (const col of table.columns || []) {
      const live = liveColsByName.get(col.name);
      if (!live) {
        issues.push({
          severity: 'critical',
          kind: 'missing_column',
          table: table.name,
          column: col.name,
          expectedType: col.type,
          source: col.source,
          message: `Column public.${table.name}.${col.name} (${col.type}) is missing. Expected from: ${col.source}.`,
        });
        continue;
      }
      if (!expectedTypeMatches(col.type, live.data_type)) {
        issues.push({
          severity: 'warning',
          kind: 'type_mismatch',
          table: table.name,
          column: col.name,
          expectedType: col.type,
          actualType: live.data_type,
          source: col.source,
          message: `Column public.${table.name}.${col.name} type=${live.data_type}, expected ${col.type}.`,
        });
      }
    }

    for (const checkName of table.checks || []) {
      const found = liveConstraints.find(
        (c) => c.table_name === table.name && c.constraint_name === checkName,
      );
      if (!found) {
        issues.push({
          severity: 'warning',
          kind: 'missing_check',
          table: table.name,
          constraint: checkName,
          message: `CHECK constraint ${checkName} is missing on public.${table.name}.`,
        });
      }
    }

    if (Array.isArray(liveIndexes) && table.uniqueIndexes) {
      for (const idx of table.uniqueIndexes) {
        const live = liveIndexes.find(
          (i) => i.tablename === table.name && i.indexname === idx.name,
        );
        if (!live) {
          issues.push({
            severity: 'warning',
            kind: 'missing_index',
            table: table.name,
            index: idx.name,
            message: `Unique index ${idx.name} is missing on public.${table.name}.`,
          });
        } else if (idx.predicate && !String(live.indexdef || '').toLowerCase().includes(idx.predicate.toLowerCase())) {
          issues.push({
            severity: 'warning',
            kind: 'index_predicate_mismatch',
            table: table.name,
            index: idx.name,
            expectedPredicate: idx.predicate,
            actualDef: live.indexdef,
            message: `Unique index ${idx.name} on public.${table.name} does not have predicate "${idx.predicate}".`,
          });
        }
      }
    }
  }

  if (Array.isArray(liveFunctions)) {
    const liveFnNames = new Set(liveFunctions.map((f) => f.proname));
    for (const fn of expectedSchema.functions || []) {
      if (!liveFnNames.has(fn.name)) {
        issues.push({
          severity: 'warning',
          kind: 'missing_function',
          function: fn.name,
          source: fn.source,
          message: `Function public.${fn.name}() is missing. Expected from: ${fn.source}.`,
        });
      }
    }
  }

  return issues;
}

function printReport(issues, { indexesAvailable, functionsAvailable }) {
  const critical = issues.filter((i) => i.severity === 'critical');
  const warnings = issues.filter((i) => i.severity === 'warning');

  console.log('');
  console.log('Schema drift check');
  console.log('==================');
  console.log(`Critical issues: ${critical.length}`);
  console.log(`Warnings:        ${warnings.length}`);
  if (!indexesAvailable) {
    console.log('Note: index check skipped — install the helper RPC __schema_drift_indexes to enable.');
  }
  if (!functionsAvailable) {
    console.log('Note: function check skipped — install the helper RPC __schema_drift_functions to enable.');
  }
  console.log('');

  if (critical.length === 0 && warnings.length === 0) {
    console.log('All expected schema items are present. Live DB matches lib/expected-schema.js.');
    return;
  }

  if (critical.length) {
    console.log('CRITICAL — production almost certainly has bugs caused by these:');
    for (const i of critical) console.log(`  • ${i.message}`);
    console.log('');
  }
  if (warnings.length) {
    console.log('WARNINGS — code may still work but the schema diverged:');
    for (const i of warnings) console.log(`  • ${i.message}`);
    console.log('');
  }

  console.log('How to fix:');
  console.log('  1. Look up the migration file listed in `source` for each missing item.');
  console.log('  2. Apply it in the Supabase SQL editor (all migrations are idempotent).');
  console.log('  3. Re-run this script. Exit code is 0 when there are no critical issues.');
}

async function main() {
  let liveTables;
  let liveColumns;
  let liveConstraints;
  let liveIndexes = null;
  let liveFunctions = null;

  try {
    [liveTables, liveColumns, liveConstraints] = await Promise.all([
      fetchTables(),
      fetchColumns(),
      fetchConstraints(),
    ]);
  } catch (err) {
    console.error('Failed to inspect live schema:', err.message);
    process.exit(2);
  }

  // Indexes + functions are best-effort; absence does not abort the run.
  try {
    liveIndexes = await fetchIndexes();
  } catch {
    liveIndexes = null;
  }
  try {
    liveFunctions = await fetchFunctions();
  } catch {
    liveFunctions = null;
  }

  const issues = buildReport({
    liveTables,
    liveColumns,
    liveConstraints,
    liveIndexes,
    liveFunctions,
  });

  if (asJson) {
    console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
  } else {
    printReport(issues, {
      indexesAvailable: Array.isArray(liveIndexes),
      functionsAvailable: Array.isArray(liveFunctions),
    });
  }

  const critical = issues.some((i) => i.severity === 'critical');
  if (strict && issues.length > 0) process.exit(1);
  if (critical) process.exit(1);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(2);
});
