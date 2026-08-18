/**
 * Reorganize agents / organizations / folders (Phase 2).
 *
 * Idempotent and SAFE BY DEFAULT (dry-run). Prints every intended change and
 * writes nothing unless you pass --apply.
 *
 *   node scripts/reorg-agents-orgs.mjs            # dry-run (default)
 *   node scripts/reorg-agents-orgs.mjs --apply    # perform the changes
 *
 * What it does:
 *   A. Silke -> a real agent (is_agent=true, active) with her own org +
 *      owner membership, and her orphan agent folder attached to that org.
 *   B. Bastian merge -> repoint every "Bastian B2B" document to his real
 *      "Bastian Mayer" folder, then delete the empty orphan folder.
 *   C. Retire the duplicate "zdk Organization" (only if unused).
 *   D. Report the "Bali" orphan folder + any other agent with >1 folder
 *      (deleted automatically only when the extra folder holds no documents).
 *
 * documents.agent_id is intentionally NOT set here — run
 * scripts/backfill-document-agent-id.mjs --apply afterwards; once Silke is an
 * agent and Bastian's folders are merged, that backfill attributes every order
 * to the right agent automatically.
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(path.join(__dirname, '..', f)); } catch {}
}

const APPLY = process.argv.includes('--apply');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const hr = (c = '\u2500') => c.repeat(80);
const nameKey = (v) => (v || '').trim().toLowerCase();
let changes = 0;

async function act(label, fn) {
  changes += 1;
  if (!APPLY) { console.log(`  [DRY-RUN] ${label}`); return null; }
  process.stdout.write(`  [APPLY]   ${label} ... `);
  try {
    const res = await fn();
    if (res?.error) { console.log(`FAILED: ${res.error.message}`); process.exitCode = 1; return null; }
    console.log('done');
    return res;
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 1;
    return null;
  }
}

function skip(label) { console.log(`  [skip]    ${label}`); }

console.log(hr('\u2550'));
console.log(`REORG agents / orgs / folders  (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
console.log(hr('\u2550'));

// ── A. Silke becomes a real agent ────────────────────────────────────────────
console.log('\nA. Silke -> full agent');
console.log(hr());
{
  const { data: silke } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_agent, agent_status, organization_id, agent_since')
    .ilike('email', '%silke%')
    .maybeSingle();

  if (!silke) {
    skip('Silke profile not found (nothing to do)');
  } else {
    // 1. Flag her as an active agent. Commission rate is left untouched for an
    //    admin to set later (per decision).
    if (!silke.is_agent || silke.agent_status !== 'active') {
      await act(`profiles: set Silke is_agent=true, agent_status='active'`, () =>
        supabase.from('profiles').update({
          is_agent: true,
          agent_status: 'active',
          agent_since: silke.agent_since || new Date().toISOString(),
        }).eq('id', silke.id));
    } else {
      skip('Silke already an active agent');
    }

    // 2. Ensure she owns an organization.
    let orgId = silke.organization_id;
    if (!orgId) {
      const orgName = `${(silke.full_name || silke.email).trim()} Organization`;
      const { data: existingOrg } = await supabase
        .from('organizations').select('id').eq('name', orgName).is('deleted_at', null).maybeSingle();
      if (existingOrg) {
        orgId = existingOrg.id;
        skip(`org "${orgName}" already exists (${orgId})`);
      } else {
        const created = await act(`organizations: create "${orgName}"`, async () => {
          const r = await supabase.from('organizations')
            .insert({ name: orgName, created_by: silke.id }).select('id').single();
          return r;
        });
        orgId = created?.data?.id || '(new-org-id)';
      }
      await act(`profiles: set Silke.organization_id`, () =>
        supabase.from('profiles').update({ organization_id: orgId }).eq('id', silke.id));
      await act(`organization_memberships: Silke owner of her org`, () =>
        supabase.from('organization_memberships').upsert(
          { organization_id: orgId, user_id: silke.id, role: 'owner' },
          { onConflict: 'organization_id,user_id' }));
    } else {
      skip(`Silke already has organization_id=${orgId}`);
    }

    // 3. Attach her orphan agent folder to that org (so it stops being an
    //    invisible orphan and becomes her single folder).
    const { data: silkeFolders } = await supabase
      .from('events').select('id, name, organization_id')
      .eq('type', 'agent').in('created_by', [silke.id]);
    const orphanNamed = (silkeFolders || []).find(
      (f) => nameKey(f.name) === nameKey(silke.full_name) && !f.organization_id);
    if (orphanNamed && orgId && orgId !== '(new-org-id)') {
      await act(`events: attach folder "${orphanNamed.name}" to Silke's org`, () =>
        supabase.from('events').update({ organization_id: orgId }).eq('id', orphanNamed.id));
    } else if (orphanNamed) {
      skip(`folder "${orphanNamed.name}" will attach once org id is known (re-run after apply)`);
    } else {
      skip('no orphan Silke folder to attach');
    }
  }
}

// ── B. Merge the two Bastians ────────────────────────────────────────────────
console.log('\nB. Merge Bastian B2B -> Bastian Mayer');
console.log(hr());
{
  const { data: bastianProfile } = await supabase
    .from('profiles').select('id, full_name, organization_id')
    .eq('is_agent', true).ilike('full_name', '%bastian%').maybeSingle();

  const { data: agentFolders } = await supabase
    .from('events').select('id, name, organization_id, created_by').eq('type', 'agent');

  const realFolder = (agentFolders || []).find(
    (f) => nameKey(f.name) === 'bastian mayer' && f.organization_id);
  const orphanFolder = (agentFolders || []).find((f) => nameKey(f.name) === 'bastian b2b');

  if (!realFolder || !orphanFolder) {
    skip(`Bastian merge not applicable (real=${!!realFolder}, orphan=${!!orphanFolder})`);
  } else {
    const { data: orphanDocs } = await supabase
      .from('documents').select('id').eq('event_id', orphanFolder.id).is('deleted_at', null);
    const count = (orphanDocs || []).length;
    if (count > 0) {
      await act(`documents: repoint ${count} "Bastian B2B" orders -> "Bastian Mayer" folder`, () =>
        supabase.from('documents').update({ event_id: realFolder.id }).eq('event_id', orphanFolder.id).is('deleted_at', null));
    } else {
      skip('no documents under "Bastian B2B"');
    }
    // Delete the orphan folder only after (dry-run counts as "would be empty").
    // Re-check for any remaining refs so an --apply is safe to repeat.
    const { data: remaining } = await supabase
      .from('documents').select('id').eq('event_id', orphanFolder.id).limit(1);
    if (!APPLY || (remaining || []).length === 0) {
      await act(`events: delete empty orphan folder "Bastian B2B" (${orphanFolder.id})`, () =>
        supabase.from('events').delete().eq('id', orphanFolder.id));
    } else {
      skip('orphan "Bastian B2B" still has documents — not deleting');
    }
  }
}

// ── C. Retire the duplicate zdk organization (only if unused) ────────────────
console.log('\nC. Duplicate "zdk Organization"');
console.log(hr());
{
  const { data: zdks } = await supabase
    .from('organizations').select('id, name').ilike('name', '%zdk%organization%').is('deleted_at', null);
  if ((zdks || []).length <= 1) {
    skip('no duplicate zdk org');
  } else {
    // Keep the org that an agent profile points at; retire the other if unused.
    const { data: zdkAgents } = await supabase
      .from('profiles').select('organization_id').in('organization_id', zdks.map((o) => o.id));
    const usedOrgIds = new Set((zdkAgents || []).map((a) => a.organization_id));
    for (const org of zdks) {
      if (usedOrgIds.has(org.id)) { skip(`keep zdk org ${org.id} (has agent)`); continue; }
      // Ensure nothing else references it.
      const [{ data: evs }, { data: mems }] = await Promise.all([
        supabase.from('events').select('id').eq('organization_id', org.id).limit(1),
        supabase.from('organization_memberships').select('id').eq('organization_id', org.id).is('deleted_at', null).limit(1),
      ]);
      if ((evs || []).length || (mems || []).length) {
        skip(`zdk org ${org.id} still referenced (events/memberships) — not retiring`);
      } else {
        await act(`organizations: soft-delete unused duplicate zdk org ${org.id}`, () =>
          supabase.from('organizations').update({ deleted_at: new Date().toISOString() }).eq('id', org.id));
      }
    }
  }
}

// ── D. Report orphans + any other split-identity agents ──────────────────────
console.log('\nD. Remaining orphans / split identities (report; auto-delete only if empty)');
console.log(hr());
{
  const { data: agentFolders } = await supabase
    .from('events').select('id, name, organization_id, created_by').eq('type', 'agent');
  const orphans = (agentFolders || []).filter((f) => !f.organization_id);
  for (const o of orphans) {
    if (nameKey(o.name) === 'bastian b2b') continue; // handled in B
    const { data: docs } = await supabase
      .from('documents').select('id').eq('event_id', o.id).is('deleted_at', null).limit(1);
    if ((docs || []).length === 0) {
      await act(`events: delete empty orphan folder "${o.name}" (${o.id})`, () =>
        supabase.from('events').delete().eq('id', o.id));
    } else {
      skip(`orphan "${o.name}" (${o.id}) still holds documents — leave for manual review`);
    }
  }
}

console.log('\n' + hr('\u2550'));
if (!APPLY) {
  console.log(`DRY-RUN complete — ${changes} change(s) planned. Re-run with --apply to perform them,`);
  console.log('then run: node scripts/backfill-document-agent-id.mjs --apply');
} else {
  console.log(`APPLY complete — ${changes} change(s) attempted.`);
  console.log('Next: node scripts/backfill-document-agent-id.mjs --apply');
}
console.log(hr('\u2550'));
