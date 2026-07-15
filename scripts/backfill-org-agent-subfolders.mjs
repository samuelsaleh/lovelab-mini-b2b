#!/usr/bin/env node
/**
 * Backfill organization folder trees.
 *
 * Default is READ-ONLY. Add --apply to write.
 *
 *   node --env-file=.env scripts/backfill-org-agent-subfolders.mjs
 *   node --env-file=.env scripts/backfill-org-agent-subfolders.mjs --org-id <uuid>
 *   node --env-file=.env scripts/backfill-org-agent-subfolders.mjs --apply
 *
 * Desired tree:
 *   Organization root (owner)
 *   └── Sub-agents
 *       └── one folder per active non-owner member
 *
 * Existing direct member folders are reparented, preserving their files and
 * descendants. An obsolete owner child folder is removed only when it has no
 * files and no children. profiles.organization_id is reconciled to the active
 * membership. The script is idempotent.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const apply = process.argv.includes('--apply');
const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
};
const requestedOrgId = argValue('--org-id');

const out = (prefix, message) => console.log(`  ${prefix} ${message}`);
let failures = 0;
let changes = 0;

let orgQuery = sb.from('organizations').select('id, name').is('deleted_at', null).order('name');
if (requestedOrgId) orgQuery = orgQuery.eq('id', requestedOrgId);
const { data: organizations, error: orgError } = await orgQuery;
if (orgError) throw orgError;

console.log(`Organization folder backfill${apply ? ' (APPLY)' : ' (DRY RUN)'} — ${organizations?.length || 0} org(s)\n`);

for (const org of organizations || []) {
  console.log(`${org.name} (${org.id})`);
  try {
    const { data: memberships, error: memberError } = await sb
      .from('organization_memberships')
      .select('user_id, role, profiles:user_id(id, full_name, email, organization_id)')
      .eq('organization_id', org.id)
      .is('deleted_at', null);
    if (memberError) throw memberError;
    const owner = (memberships || []).find((m) => m.role === 'owner');
    if (!owner) throw new Error('No active owner membership');

    for (const member of memberships || []) {
      if (member.profiles?.organization_id === org.id) continue;
      changes += 1;
      out(apply ? 'FIX' : 'DRY', `profile org link: ${member.profiles?.full_name || member.user_id} → ${org.id}`);
      if (apply) {
        const { error } = await sb.from('profiles').update({ organization_id: org.id }).eq('id', member.user_id);
        if (error) throw error;
      }
    }

    let { data: root, error: rootError } = await sb
      .from('agent_folders')
      .select('id, name, agent_id')
      .eq('organization_id', org.id)
      .is('parent_id', null)
      .maybeSingle();
    if (rootError) throw rootError;
    if (!root) {
      changes += 1;
      out(apply ? 'CREATE' : 'DRY', `root folder "${org.name}"`);
      if (apply) {
        const result = await sb.from('agent_folders').insert({
          organization_id: org.id,
          agent_id: owner.user_id,
          name: org.name,
          parent_id: null,
        }).select('id, name, agent_id').single();
        if (result.error) throw result.error;
        root = result.data;
      } else {
        // Cannot safely plan descendants without a real root ID.
        out('INFO', 'descendants will be created after root during --apply');
        console.log('');
        continue;
      }
    }

    let { data: subAgents, error: groupError } = await sb
      .from('agent_folders')
      .select('id, name, agent_id')
      .eq('parent_id', root.id)
      .eq('name', 'Sub-agents')
      .maybeSingle();
    if (groupError) throw groupError;
    if (!subAgents) {
      changes += 1;
      out(apply ? 'CREATE' : 'DRY', '"Sub-agents" grouping folder');
      if (apply) {
        const result = await sb.from('agent_folders').insert({
          agent_id: owner.user_id,
          name: 'Sub-agents',
          parent_id: root.id,
        }).select('id, name, agent_id').single();
        if (result.error) throw result.error;
        subAgents = result.data;
      }
    }

    const { data: directChildren, error: childError } = await sb
      .from('agent_folders')
      .select('id, name, agent_id, parent_id')
      .eq('parent_id', root.id);
    if (childError) throw childError;

    for (const member of memberships || []) {
      const name = member.profiles?.full_name || member.profiles?.email || 'Agent';
      const direct = (directChildren || []).find((f) => f.agent_id === member.user_id && f.name !== 'Sub-agents');

      if (member.user_id === owner.user_id) {
        if (!direct) continue;
        const [{ count: fileCount }, { count: childCount }] = await Promise.all([
          sb.from('agent_folder_files').select('id', { count: 'exact', head: true }).eq('folder_id', direct.id),
          sb.from('agent_folders').select('id', { count: 'exact', head: true }).eq('parent_id', direct.id),
        ]);
        if ((fileCount || 0) === 0 && (childCount || 0) === 0) {
          changes += 1;
          out(apply ? 'DELETE' : 'DRY', `empty obsolete owner child "${direct.name}"`);
          if (apply) {
            const { error } = await sb.from('agent_folders').delete().eq('id', direct.id);
            if (error) throw error;
          }
        } else {
          out('KEEP', `owner child "${direct.name}" has ${fileCount || 0} file(s), ${childCount || 0} child folder(s)`);
        }
        continue;
      }

      if (!subAgents?.id) {
        out('DRY', `member folder "${name}" will be nested after Sub-agents is created`);
        changes += 1;
        continue;
      }

      const { data: nested, error: nestedError } = await sb
        .from('agent_folders')
        .select('id, name, agent_id, parent_id')
        .eq('parent_id', subAgents.id)
        .eq('agent_id', member.user_id)
        .maybeSingle();
      if (nestedError) throw nestedError;
      if (nested) {
        out('OK', `"${name}" already nested`);
      } else if (direct) {
        changes += 1;
        out(apply ? 'MOVE' : 'DRY', `"${direct.name}" → Sub-agents`);
        if (apply) {
          const { error } = await sb.from('agent_folders').update({ parent_id: subAgents.id }).eq('id', direct.id);
          if (error) throw error;
        }
      } else {
        changes += 1;
        out(apply ? 'CREATE' : 'DRY', `member folder "${name}" under Sub-agents`);
        if (apply) {
          const { error } = await sb.from('agent_folders').insert({
            agent_id: member.user_id,
            name,
            parent_id: subAgents.id,
          });
          if (error) throw error;
        }
      }
    }
  } catch (error) {
    failures += 1;
    out('FAIL', error.message);
  }
  console.log('');
}

console.log(`Done: ${changes} planned/applied change(s), ${failures} failure(s).`);
if (!apply) console.log('No writes performed. Re-run with --apply after reviewing this output.');
process.exit(failures > 0 ? 1 : 0);
