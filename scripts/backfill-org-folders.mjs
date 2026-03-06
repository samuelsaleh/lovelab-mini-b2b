/**
 * Backfill script: ensures every existing organization has a root folder
 * and default subfolders in the agent_folders table.
 *
 * Run with: node scripts/backfill-org-folders.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 * Safe to run multiple times (idempotent).
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const DEFAULT_SUBFOLDERS = ['Contracts', 'Orders', 'Invoices', 'Other'];

async function backfill() {
  const { data: orgs, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name')
    .is('deleted_at', null);

  if (orgErr) {
    console.error('Failed to fetch organizations:', orgErr.message);
    process.exit(1);
  }

  console.log(`Found ${orgs.length} organizations to check.`);

  for (const org of orgs) {
    const { data: members } = await supabase
      .from('organization_memberships')
      .select('user_id, role')
      .eq('organization_id', org.id)
      .is('deleted_at', null)
      .is('deleted_at', null);

    const owner = (members || []).find(m => m.role === 'owner') || members?.[0];
    const ownerId = owner?.user_id;
    if (!ownerId) {
      console.log(`  [SKIP] ${org.name} (${org.id}) -- no members found`);
      continue;
    }

    const { data: existingRoot } = await supabase
      .from('agent_folders')
      .select('id, name')
      .eq('agent_id', ownerId)
      .is('parent_id', null)
      .ilike('name', org.name)
      .limit(1);

    if (existingRoot && existingRoot.length > 0) {
      const rootId = existingRoot[0].id;
      const { data: existingSubs } = await supabase
        .from('agent_folders')
        .select('name')
        .eq('parent_id', rootId);

      const existingNames = new Set((existingSubs || []).map(s => s.name));
      const missing = DEFAULT_SUBFOLDERS.filter(n => !existingNames.has(n));

      if (missing.length > 0) {
        const rows = missing.map(name => ({ agent_id: ownerId, name, parent_id: rootId }));
        await supabase.from('agent_folders').insert(rows);
        console.log(`  [PATCHED] ${org.name} -- added ${missing.length} missing subfolders`);
      } else {
        console.log(`  [OK] ${org.name} -- root + subfolders exist`);
      }
      continue;
    }

    const { data: rootFolder, error: rootErr } = await supabase
      .from('agent_folders')
      .insert({ agent_id: ownerId, name: org.name, parent_id: null })
      .select('id')
      .single();

    if (rootErr) {
      console.error(`  [ERROR] ${org.name} -- failed to create root:`, rootErr.message);
      continue;
    }

    const subRows = DEFAULT_SUBFOLDERS.map(name => ({
      agent_id: ownerId,
      name,
      parent_id: rootFolder.id,
    }));

    const { error: subErr } = await supabase.from('agent_folders').insert(subRows);
    if (subErr) {
      console.error(`  [ERROR] ${org.name} -- failed to create subfolders:`, subErr.message);
    } else {
      console.log(`  [CREATED] ${org.name} -- root + 4 subfolders`);
    }
  }

  console.log('Backfill complete.');
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
