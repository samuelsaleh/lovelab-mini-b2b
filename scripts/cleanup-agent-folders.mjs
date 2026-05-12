#!/usr/bin/env node
/**
 * One-off Phase 21 data fix:
 *
 *   1. Link every agent folder that was created with null organization_id
 *      back to its matching agent's organization (Bastian, Josephine,
 *      Marc, plus the kept Nicolas folder).
 *   2. Move the single PO/quote currently sitting in the legacy "nicolas
 *      vial" folder over to the kept "NICOLAS WHOLESALE FRANCE" folder.
 *   3. Rename Corinne's + Nicolas's profile.full_name so future
 *      auto-creates resolve to the kept folder (the names Sam wants
 *      everywhere — "CORINNE SECRET CODE PARIS" and "NICOLAS WHOLESALE
 *      FRANCE").
 *   4. Delete the now-empty legacy folders ("Corinne Ruimy", "nicolas
 *      vial").
 *
 * Anything that creates/links commissions is handled by the existing
 * scripts/backfill-missing-commissions.mjs — call it after this for the
 * PO Oxygène backfill.
 *
 * Usage:
 *   node scripts/cleanup-agent-folders.mjs            # dry-run
 *   node scripts/cleanup-agent-folders.mjs --apply    # write
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
const apply = process.argv.includes('--apply');
const tag = apply ? 'APPLY' : 'DRY-RUN';

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ─── Plan ─────────────────────────────────────────────────────────────────
// Each entry: action description + the actual write to perform.
// We DO NOT touch Bali — Sam didn't mention it and it has 1 doc that may
// be a real partner-style folder we don't want to mistakenly relink.
const plan = [];

async function main() {
  // Resolve all the IDs fresh from the DB so the script is idempotent and
  // re-runnable even if someone tweaks rows in between attempts.
  const { data: events } = await sb
    .from('events')
    .select('id, name, organization_id, type, created_by')
    .eq('type', 'agent');
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, full_name, email, organization_id, is_agent, agent_status, agent_deleted_at')
    .or('is_agent.eq.true,agent_status.in.(invited,active,inactive)')
    .is('agent_deleted_at', null);

  const findEvent = (name) => events.find((e) => (e.name || '').trim().toLowerCase() === name.trim().toLowerCase());
  const findAgent = (full_name) => profiles.find((p) => (p.full_name || '').trim().toLowerCase() === full_name.trim().toLowerCase());

  const corinneProfile = findAgent('Corinne Ruimy');
  const nicolasProfile = findAgent('nicolas vial');
  const bastianProfile = findAgent('Bastian Mayer');
  const josephineProfile = findAgent('Josephine Berazzal');
  const marcProfile = findAgent('Marc Schlund');

  const corinneRuimyFolder = findEvent('Corinne Ruimy');
  const corinneKeptFolder = findEvent('CORINNE SECRET CODE PARIS');
  const nicolasVialFolder = findEvent('nicolas vial');
  const nicolasKeptFolder = findEvent('NICOLAS WHOLESALE FRANCE');
  const bastianFolder = findEvent('Bastian Mayer');
  const josephineFolder = findEvent('Josephine Berazzal');
  const marcFolder = findEvent('Marc Schlund');

  // ── Bastian / Josephine / Marc: just link the existing folder to the org.
  for (const [agent, folder] of [
    [bastianProfile, bastianFolder],
    [josephineProfile, josephineFolder],
    [marcProfile, marcFolder],
  ]) {
    if (!agent || !folder) continue;
    if (folder.organization_id) continue; // already linked
    if (!agent.organization_id) continue; // no org to link to
    plan.push({
      label: `link ${folder.name} folder → org ${agent.organization_id} (${agent.full_name})`,
      run: () => sb.from('events').update({ organization_id: agent.organization_id }).eq('id', folder.id),
    });
  }

  // ── Nicolas: link kept folder → org, move the 1 doc, rename profile, delete legacy folder.
  if (nicolasProfile && nicolasKeptFolder) {
    if (!nicolasKeptFolder.organization_id && nicolasProfile.organization_id) {
      plan.push({
        label: `link NICOLAS WHOLESALE FRANCE folder → org ${nicolasProfile.organization_id}`,
        run: () => sb.from('events').update({ organization_id: nicolasProfile.organization_id }).eq('id', nicolasKeptFolder.id),
      });
    }
  }
  if (nicolasVialFolder && nicolasKeptFolder) {
    plan.push({
      label: `move all docs from "nicolas vial" folder → "NICOLAS WHOLESALE FRANCE"`,
      run: () => sb.from('documents').update({ event_id: nicolasKeptFolder.id }).eq('event_id', nicolasVialFolder.id),
    });
  }
  if (nicolasProfile && nicolasProfile.full_name !== 'NICOLAS WHOLESALE FRANCE') {
    plan.push({
      label: `rename profile "${nicolasProfile.full_name}" → "NICOLAS WHOLESALE FRANCE"`,
      run: () => sb.from('profiles').update({ full_name: 'NICOLAS WHOLESALE FRANCE' }).eq('id', nicolasProfile.id),
    });
  }
  if (nicolasVialFolder) {
    plan.push({
      label: `delete legacy "nicolas vial" folder (${nicolasVialFolder.id.slice(0, 8)}…)`,
      run: () => sb.from('events').delete().eq('id', nicolasVialFolder.id),
    });
  }

  // ── Corinne: rename profile, delete legacy "Corinne Ruimy" folder.
  if (corinneProfile && corinneProfile.full_name !== 'CORINNE SECRET CODE PARIS') {
    plan.push({
      label: `rename profile "${corinneProfile.full_name}" → "CORINNE SECRET CODE PARIS"`,
      run: () => sb.from('profiles').update({ full_name: 'CORINNE SECRET CODE PARIS' }).eq('id', corinneProfile.id),
    });
  }
  if (corinneRuimyFolder) {
    // Sanity: confirm the folder is empty before deleting (it was on first
    // inspection but a doc might have landed since).
    const { count } = await sb
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', corinneRuimyFolder.id)
      .is('deleted_at', null);
    if (count === 0) {
      plan.push({
        label: `delete legacy "Corinne Ruimy" folder (${corinneRuimyFolder.id.slice(0, 8)}…) — confirmed empty`,
        run: () => sb.from('events').delete().eq('id', corinneRuimyFolder.id),
      });
    } else {
      plan.push({
        label: `[SKIP] "Corinne Ruimy" folder has ${count} live docs — cannot safely delete`,
        run: () => Promise.resolve({ data: null, error: null }),
      });
    }
  }

  // ── Execute
  console.log(`\n[${tag}] ${plan.length} action(s):`);
  for (const step of plan) {
    console.log(`  - ${step.label}`);
  }
  if (!apply) {
    console.log(`\nDry-run only. Re-run with --apply to write.`);
    return;
  }
  console.log(`\nApplying...`);
  for (const step of plan) {
    process.stdout.write(`  · ${step.label} ... `);
    try {
      const { error } = await step.run();
      if (error) {
        console.log(`FAILED: ${error.message}`);
      } else {
        console.log('ok');
      }
    } catch (err) {
      console.log(`THROWN: ${err.message}`);
    }
  }
  console.log(`\nDone. Re-run scripts/inspect-agent-folders.mjs to verify.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
