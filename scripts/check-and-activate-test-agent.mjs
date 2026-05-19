#!/usr/bin/env node
/**
 * One-off helper: inspect (and optionally activate) a test agent.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.
 *
 * Usage:
 *   node scripts/check-and-activate-test-agent.mjs <email>          # dry-run, just show
 *   node scripts/check-and-activate-test-agent.mjs <email> --apply  # also flip status to 'active'
 *
 * Why this exists:
 *   The commission attribution code in lib/commissionAttribution.js skips
 *   any agent whose agent_status !== 'active'. If a test account is left
 *   on 'inactive', orders save fine but no agent_commissions row is
 *   created, so READY TO PAY / AWAITING CUSTOMER stay at €0. This script
 *   makes that one-line fix instead of asking Sam to click through the
 *   admin UI.
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

const email = process.argv[2];
const apply = process.argv.includes('--apply');

if (!email) {
  console.error('Usage: node scripts/check-and-activate-test-agent.mjs <email> [--apply]');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const { data: profiles, error } = await supabase
  .from('profiles')
  .select('id, email, full_name, is_agent, agent_status, commission_rate, organization_id')
  .ilike('email', email);

if (error) {
  console.error('Lookup failed:', error.message);
  process.exit(1);
}

if (!profiles || profiles.length === 0) {
  console.error(`No profile found for email "${email}"`);
  process.exit(1);
}

console.log(`Found ${profiles.length} profile(s) for ${email}:`);
for (const p of profiles) {
  console.log(`  • id=${p.id}`);
  console.log(`    name=${p.full_name || '(none)'}  is_agent=${p.is_agent}  status=${p.agent_status || '(null)'}  rate=${p.commission_rate ?? '(null)'}%  org=${p.organization_id || '(none)'}`);
}

if (!apply) {
  console.log('\nDry-run only. Re-run with --apply to set agent_status="active" and is_agent=true on these rows.');
  process.exit(0);
}

const ids = profiles.map((p) => p.id);
const { error: updErr } = await supabase
  .from('profiles')
  .update({ agent_status: 'active', is_agent: true })
  .in('id', ids);

if (updErr) {
  console.error('Update failed:', updErr.message);
  process.exit(1);
}

console.log('\n✅ Updated. New state:');
const { data: after } = await supabase
  .from('profiles')
  .select('id, email, full_name, is_agent, agent_status, commission_rate')
  .in('id', ids);
for (const p of after || []) {
  console.log(`  • ${p.email}: is_agent=${p.is_agent}  status=${p.agent_status}  rate=${p.commission_rate}%`);
}
