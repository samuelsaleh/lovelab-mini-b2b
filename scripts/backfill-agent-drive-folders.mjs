/**
 * Phase 22 backfill — create + cache the Google Drive folder for every
 * existing agent so they don't have to wait for their first report to
 * trigger lazy-creation.
 *
 * Modes:
 *   - DRY RUN (default):  prints what WOULD happen, makes no changes.
 *       node scripts/backfill-agent-drive-folders.mjs
 *   - APPLY:              actually creates the folders + writes the ids.
 *       node scripts/backfill-agent-drive-folders.mjs --apply
 *
 * Idempotent: re-running with all agents already linked is a no-op
 * (skips rows where `drive_folder_id IS NOT NULL`).
 *
 * Required env (load with `npm run … --` if you have a wrapper):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID  (parent-of-agent-folders!)
 *   - GOOGLE_DRIVE_CLIENT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY  OR
 *     whatever credentials lib/google-drive.js currently consumes.
 *
 * Failure stance: per-agent failures are logged and the script CONTINUES
 * to the next agent. The exit code is non-zero only if the script itself
 * could not start (missing env, DB connection failed).
 */

import { createClient } from '@supabase/supabase-js';
import { ensureAgentDriveFolder } from '../lib/agentDriveFolder.js';

const APPLY = process.argv.includes('--apply');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID) {
  console.error(
    'Missing GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID (set this to the\n' +
    'parent-of-agent-folders id in Google Drive — the new Phase 22 root).',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

function log(prefix, agent, msg) {
  const tag = `${prefix.padEnd(9)}`;
  const name = agent.full_name || agent.email || agent.id;
  console.log(`  ${tag} ${name}${msg ? ` -- ${msg}` : ''}`);
}

async function backfill() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write to Drive + DB)' : 'DRY RUN (no writes)'}`);
  console.log('');

  const { data: agents, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, drive_folder_id, is_agent, agent_status, agent_deleted_at')
    .eq('is_agent', true)
    .neq('agent_status', 'archived')
    .is('agent_deleted_at', null)
    .order('full_name', { ascending: true });

  if (error) {
    console.error('Failed to fetch agents:', error.message);
    process.exit(1);
  }

  if (!agents || agents.length === 0) {
    console.log('No agents found. Done.');
    return;
  }

  console.log(`Found ${agents.length} active agent(s) to check.\n`);

  const stats = {
    cached: 0,    // already had drive_folder_id
    created: 0,   // would-create / created (depending on mode)
    skipped: 0,   // skipped due to missing name / env
    failed: 0,    // Drive API errored
  };

  for (const agent of agents) {
    if (agent.drive_folder_id) {
      log('[CACHED]', agent, agent.drive_folder_id);
      stats.cached++;
      continue;
    }

    if (!APPLY) {
      log('[DRY]', agent, 'would create Drive folder');
      stats.created++;
      continue;
    }

    const drive = await ensureAgentDriveFolder({
      agentName: agent.full_name || agent.email,
      cachedFolderId: null,
    });

    if (drive.skipped) {
      log('[SKIP]', agent, drive.reason || 'skipped');
      stats.skipped++;
      continue;
    }

    if (!drive.ok || !drive.folderId) {
      log('[FAIL]', agent, drive.error || 'unknown error');
      stats.failed++;
      continue;
    }

    const { error: upErr } = await supabase
      .from('profiles')
      .update({ drive_folder_id: drive.folderId })
      .eq('id', agent.id);

    if (upErr) {
      log('[FAIL]', agent, `DB write failed: ${upErr.message}`);
      stats.failed++;
      continue;
    }

    log('[CREATED]', agent, drive.folderId);
    stats.created++;
  }

  console.log('');
  console.log('─────────────── Summary ───────────────');
  console.log(`  Already cached:   ${stats.cached}`);
  console.log(`  ${APPLY ? 'Created' : 'Would create'}: ${stats.created}`);
  console.log(`  Skipped:          ${stats.skipped}`);
  console.log(`  Failed:           ${stats.failed}`);
  console.log('───────────────────────────────────────');
  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to actually create the folders.');
  }
}

backfill().catch((err) => {
  console.error('Backfill crashed:', err);
  process.exit(1);
});
