#!/usr/bin/env node
/**
 * Canonicalize historical profile IDs for organization data.
 *
 * Default is READ-ONLY. The script never deletes documents or files. It moves
 * references from an old profile UUID to the active membership UUID when both
 * profiles share the same normalized email. Commission conflicts are preserved
 * and reported for manual review rather than overwritten.
 *
 * Usage:
 *   node --env-file=.env scripts/repair-org-legacy-ids.mjs --org-id <uuid>
 *   node --env-file=.env scripts/repair-org-legacy-ids.mjs --org-id <uuid> --apply
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orgId = process.argv[process.argv.indexOf('--org-id') + 1];
const apply = process.argv.includes('--apply');
if (!url || !key || !orgId || orgId.startsWith('--')) {
  console.error('Usage: node --env-file=.env scripts/repair-org-legacy-ids.mjs --org-id <uuid> [--apply]');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const normalize = (value) => String(value || '').trim().toLowerCase();

const { data: memberships, error: memberError } = await sb
  .from('organization_memberships')
  .select('user_id, profiles:user_id(id, email, full_name)')
  .eq('organization_id', orgId)
  .is('deleted_at', null);
if (memberError) throw memberError;

const canonicalByEmail = new Map(
  (memberships || [])
    .map((member) => [normalize(member.profiles?.email), member])
    .filter(([email]) => email)
);
const emails = [...canonicalByEmail.keys()];
const { data: sameEmailProfiles, error: profileError } = emails.length > 0
  ? await sb.from('profiles').select('id, email, full_name').in('email', emails)
  : { data: [], error: null };
if (profileError) throw profileError;

const pairs = (sameEmailProfiles || [])
  .map((legacy) => {
    const canonical = canonicalByEmail.get(normalize(legacy.email));
    return canonical && canonical.user_id !== legacy.id
      ? { legacy, canonical }
      : null;
  })
  .filter(Boolean);

console.log(`Legacy profile repair${apply ? ' (APPLY)' : ' (DRY RUN)'} — ${pairs.length} legacy ID(s)\n`);
let failures = 0;

for (const { legacy, canonical } of pairs) {
  console.log(`${legacy.email}: ${legacy.id} → ${canonical.user_id}`);
  for (const table of ['documents', 'events', 'agent_payments']) {
    const column = table === 'agent_payments' ? 'agent_id' : 'created_by';
    const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true }).eq(column, legacy.id);
    if (error) {
      failures += 1;
      console.log(`  ✗ ${table}: ${error.message}`);
      continue;
    }
    console.log(`  ${apply ? 'MOVE' : 'DRY '} ${table}.${column}: ${count || 0} row(s)`);
    if (apply && count > 0) {
      const result = await sb.from(table).update({ [column]: canonical.user_id }).eq(column, legacy.id);
      if (result.error) {
        failures += 1;
        console.log(`    ✗ ${result.error.message}`);
      }
    }
  }

  const { data: legacyCommissions, error: commissionError } = await sb
    .from('agent_commissions')
    .select('id, document_id, type')
    .eq('agent_id', legacy.id);
  if (commissionError) {
    failures += 1;
    console.log(`  ✗ commissions: ${commissionError.message}`);
    continue;
  }
  for (const row of legacyCommissions || []) {
    let conflict = null;
    if (row.document_id) {
      const result = await sb
        .from('agent_commissions')
        .select('id')
        .eq('agent_id', canonical.user_id)
        .eq('document_id', row.document_id)
        .eq('type', row.type)
        .maybeSingle();
      conflict = result.data;
    }
    if (conflict) {
      console.log(`  ⚠ KEEP commission ${row.id}: canonical conflict ${conflict.id} (manual review)`);
      continue;
    }
    console.log(`  ${apply ? 'MOVE' : 'DRY '} commission ${row.id}`);
    if (apply) {
      const result = await sb.from('agent_commissions').update({ agent_id: canonical.user_id }).eq('id', row.id);
      if (result.error) {
        failures += 1;
        console.log(`    ✗ ${result.error.message}`);
      }
    }
  }
  console.log('');
}

if (pairs.length === 0) console.log('No legacy profile IDs found. Nothing to repair.');
if (!apply) console.log('\nNo writes performed. Re-run with --apply after reviewing.');
process.exit(failures > 0 ? 1 : 0);
