#!/usr/bin/env node
/**
 * Read-only diagnostic: dumps every type='agent' event row alongside the
 * matching agent profile so we can spot duplicates and orphans before
 * touching any data.
 *
 * Usage:
 *   node scripts/inspect-agent-folders.mjs
 *   node scripts/inspect-agent-folders.mjs --doc <doc_id>   # also show the
 *                                                            # doc + its
 *                                                            # event + the
 *                                                            # commission row
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const docArgIdx = process.argv.indexOf('--doc');
const docArg = docArgIdx >= 0 ? process.argv[docArgIdx + 1] : null;

function fmtId(id) { return id ? id.slice(0, 8) + '…' : '(null)'; }

async function main() {
  console.log('\n=== AGENT PROFILES ===');
  const { data: agents, error: aErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_agent, agent_status, organization_id, agent_deleted_at')
    .or('is_agent.eq.true,agent_status.in.(invited,active,inactive)')
    .is('agent_deleted_at', null)
    .order('full_name', { ascending: true });
  if (aErr) throw aErr;
  console.log(`(${agents.length} active agents)`);
  for (const a of agents) {
    console.log(`  ${fmtId(a.id)}  full_name="${a.full_name}"  email=${a.email}  org=${fmtId(a.organization_id)}  status=${a.agent_status}`);
  }

  console.log('\n=== EVENT FOLDERS (type=agent) ===');
  const { data: events, error: eErr } = await supabase
    .from('events')
    .select('id, name, type, organization_id, created_by, created_at')
    .eq('type', 'agent')
    .order('name', { ascending: true });
  if (eErr) throw eErr;
  console.log(`(${events.length} agent folders)`);

  // Group by lowercase name to spot collisions
  const byOrg = new Map();
  for (const e of events) {
    const matchByName = agents.find(a => (a.full_name || '').trim().toLowerCase() === (e.name || '').trim().toLowerCase());
    const matchByOrg = e.organization_id ? agents.find(a => a.organization_id === e.organization_id) : null;
    const status = matchByName
      ? `linked-by-name → ${matchByName.full_name}`
      : matchByOrg
        ? `linked-by-org → ${matchByOrg.full_name}`
        : 'ORPHAN (no agent matches by name OR org)';
    console.log(`  ${fmtId(e.id)}  name="${e.name}"  org=${fmtId(e.organization_id)}  ${status}`);
    const orgKey = e.organization_id || `name:${(e.name || '').toLowerCase().trim()}`;
    if (!byOrg.has(orgKey)) byOrg.set(orgKey, []);
    byOrg.get(orgKey).push(e);
  }

  console.log('\n=== DUPLICATE CLUSTERS (same org_id OR same name) ===');
  let dupeCount = 0;
  for (const [key, list] of byOrg.entries()) {
    if (list.length > 1) {
      dupeCount++;
      console.log(`  cluster ${key}:`);
      for (const e of list) {
        console.log(`    ${fmtId(e.id)}  "${e.name}"  org=${fmtId(e.organization_id)}`);
      }
    }
  }
  if (dupeCount === 0) console.log('  (none)');

  console.log('\n=== AGENT FOLDERS NAMED LIKE A KNOWN AGENT BUT WITH null ORG ===');
  let nullOrgCount = 0;
  for (const e of events) {
    if (e.organization_id) continue;
    const matchByName = agents.find(a => (a.full_name || '').trim().toLowerCase() === (e.name || '').trim().toLowerCase());
    if (matchByName && matchByName.organization_id) {
      nullOrgCount++;
      console.log(`  ${fmtId(e.id)}  "${e.name}"  → should link to org ${fmtId(matchByName.organization_id)} (${matchByName.full_name})`);
    }
  }
  if (nullOrgCount === 0) console.log('  (none — but unlinked folders for unmatched names may still exist)');

  if (docArg) {
    console.log(`\n=== DOC ${docArg} ===`);
    const { data: doc } = await supabase
      .from('documents')
      .select('id, client_company, client_name, total_amount, order_channel, created_by, event_id, created_at, deleted_at, document_type')
      .eq('id', docArg)
      .maybeSingle();
    console.log(JSON.stringify(doc, null, 2));
    if (doc?.event_id) {
      const { data: evt } = await supabase
        .from('events')
        .select('id, name, type, organization_id, created_by')
        .eq('id', doc.event_id)
        .maybeSingle();
      console.log('  event:', JSON.stringify(evt, null, 2));
    }
    const { data: comm } = await supabase
      .from('agent_commissions')
      .select('id, agent_id, type, status, customer_paid_at, commission_amount, order_total, commission_rate')
      .eq('document_id', docArg);
    console.log('  agent_commissions rows:', JSON.stringify(comm, null, 2));
  }

  console.log('\n=== PO Oxygène search ===');
  const { data: poOx } = await supabase
    .from('documents')
    .select('id, client_company, client_name, total_amount, order_channel, event_id, created_at, document_type')
    .ilike('client_company', '%oxyg%')
    .is('deleted_at', null);
  if (!poOx || poOx.length === 0) {
    const { data: poOx2 } = await supabase
      .from('documents')
      .select('id, client_company, client_name, total_amount, order_channel, event_id, created_at, document_type, metadata')
      .or('client_company.ilike.%oxyg%,client_name.ilike.%oxyg%')
      .is('deleted_at', null);
    console.log(JSON.stringify(poOx2, null, 2));
  } else {
    console.log(JSON.stringify(poOx, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
