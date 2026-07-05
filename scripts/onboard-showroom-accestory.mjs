// One-shot: onboard the full Showroom Accestory team (France partner) into
// their organization, using the exact same proven invite flow as
// POST /api/agents and the Team page (lib/agents/invite.js):
//   allowed_emails grant + temp-password auth account + agent profile
//   + org membership + org folder provisioning + welcome email.
//
// Usage:
//   node --env-file=.env scripts/onboard-showroom-accestory.mjs [--dry-run] [--no-email] [--org-id <uuid>]
//
//   --dry-run   read-only: shows the org match, current members, and what
//               would be done for each person. ALWAYS run this first.
//   --no-email  provision everyone but skip the welcome emails (temp
//               passwords are printed so you can forward them manually).
//   --org-id    skip the name search and target this organization id.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
// RESEND_API_KEY is needed for the welcome emails; without it the accounts
// are still created and the temp passwords are printed at the end.
//
// Idempotent: re-running skips people who are already active members and
// upgrades/reactivates the rest, so a partial failure can be retried safely.

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { inviteAgent } from '../lib/agents/invite.js';

// ─── Roster ──────────────────────────────────────────────────────────────────
// membershipRole: 'member' for everyone except Alice (Responsable commerciale),
// who gets 'owner' so she can manage the team from the /agent/team page.
export const ROSTER = [
  { email: 'alice@showroomaccestory.com', fullName: 'Alice Cadenet', title: 'Responsable commerciale', membershipRole: 'owner' },
  { email: 'marie-louise@showroomaccestory.com', fullName: 'Marie-Louise Trochain', title: 'Commerciale', membershipRole: 'member' },
  { email: 'caren@showroomaccestory.com', fullName: 'Caren Melkonian', title: 'Commerciale', membershipRole: 'member' },
  { email: 'wassila@showroomaccestory.com', fullName: 'Wassila Mekidiche', title: 'Commerciale', membershipRole: 'member' },
  { email: 'hannah@showroomaccestory.com', fullName: 'Hannah Hinet', title: 'Commerciale', membershipRole: 'member' },
  { email: 'stephanie@showroomaccestory.com', fullName: 'Stéphanie Gerster', title: 'ADV', membershipRole: 'member' },
  { email: 'ruby@showroomaccestory.com', fullName: 'Ruby Robin', title: 'ADV', membershipRole: 'member' },
  { email: 'agence@showroomaccestory.com', fullName: 'Marion Husson', title: 'ADV', membershipRole: 'member' },
];

export const ORG_NAME_PATTERNS = ['%showroom%', '%accestory%', '%accessory%'];
const COMPANY_NAME = 'Showroom Accestory';

// ─── Org resolution ──────────────────────────────────────────────────────────

/**
 * Find the target organization. Explicit --org-id wins; otherwise search by
 * name patterns and require exactly ONE match (never guess with real data).
 *
 * @returns {{ org: object|null, candidates: array, reason: string|null }}
 */
export async function resolveOrganization(admin, { orgId = null, patterns = ORG_NAME_PATTERNS } = {}) {
  if (orgId) {
    const { data: org, error } = await admin
      .from('organizations')
      .select('id, name, territory, commission_rate')
      .eq('id', orgId)
      .maybeSingle();
    if (error) return { org: null, candidates: [], reason: `lookup failed: ${error.message}` };
    if (!org) return { org: null, candidates: [], reason: `no organization with id ${orgId}` };
    return { org, candidates: [org], reason: null };
  }

  const { data: orgs, error } = await admin
    .from('organizations')
    .select('id, name, territory, commission_rate')
    .or(patterns.map((p) => `name.ilike.${p}`).join(','));
  if (error) return { org: null, candidates: [], reason: `search failed: ${error.message}` };

  const candidates = orgs || [];
  if (candidates.length === 1) return { org: candidates[0], candidates, reason: null };
  if (candidates.length === 0) return { org: null, candidates, reason: 'no organization matched the name search' };
  return { org: null, candidates, reason: 'multiple organizations matched — pass --org-id to disambiguate' };
}

// ─── Per-member planning (also powers --dry-run) ────────────────────────────

/**
 * Classify what inviteAgent would do for one roster entry:
 *   'skip'       — already an active member of this org
 *   'reactivate' — has a soft-deleted membership that will be restored
 *   'upgrade'    — profile exists but is not in the org yet
 *   'create'     — brand-new person (auth user + profile + membership)
 */
export async function planMember(admin, orgId, member) {
  const email = member.email.trim().toLowerCase();

  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, full_name, is_agent, agent_status, organization_id')
    .eq('email', email)
    .maybeSingle();

  if (!profile) return { action: 'create', profile: null, membership: null };

  const { data: membership } = await admin
    .from('organization_memberships')
    .select('id, role, deleted_at')
    .eq('organization_id', orgId)
    .eq('user_id', profile.id)
    .maybeSingle();

  if (membership && !membership.deleted_at) return { action: 'skip', profile, membership };
  if (membership && membership.deleted_at) return { action: 'reactivate', profile, membership };

  // Guardrail: never silently poach someone who belongs to ANOTHER org.
  if (profile.organization_id && profile.organization_id !== orgId) {
    return { action: 'conflict', profile, membership: null };
  }
  return { action: 'upgrade', profile, membership: null };
}

// ─── Injected deps (this script runs outside Next.js) ───────────────────────

/** Plain-fetch Resend sender (same behavior as lib/send-email.js). */
export function makeSendEmail({ apiKey = process.env.RESEND_API_KEY, sender = process.env.SENDER_EMAIL || 'dionne@love-lab.com' } = {}) {
  return async function sendEmail({ to, subject, html }) {
    if (!apiKey) return { sent: false, reason: 'no_api_key' };
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `LoveLab <${sender}>`, to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, reason: 'resend_error', status: res.status, error: body };
    }
    const data = await res.json().catch(() => ({}));
    return { sent: true, message_id: data?.id || null };
  };
}

/**
 * Same folder provisioning as lib/organizations/provision-agent.js, but bound
 * to this script's supabase client (the lib version imports next/headers).
 */
export function makeProvisionAgentInOrg(admin) {
  return async function provisionAgentInOrg(orgId, agentId) {
    if (!orgId || !agentId) return null;

    const { data: org } = await admin.from('organizations').select('id, name').eq('id', orgId).single();
    if (!org) return null;

    const { data: ownerMembership } = await admin
      .from('organization_memberships')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();

    const { data: agentProfile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', agentId)
      .single();

    const ownerAgentId = ownerMembership?.user_id || agentId;
    const agentName = agentProfile?.full_name || agentProfile?.email || 'Agent';

    let { data: rootFolder } = await admin
      .from('agent_folders')
      .select('id, name')
      .eq('organization_id', orgId)
      .is('parent_id', null)
      .maybeSingle();

    if (!rootFolder) {
      const { data: created, error } = await admin
        .from('agent_folders')
        .insert({ agent_id: ownerAgentId, name: org.name || 'Organization', parent_id: null, organization_id: orgId })
        .select('id, name')
        .single();
      if (error) throw error;
      rootFolder = created;
    }

    let { data: subfolder } = await admin
      .from('agent_folders')
      .select('id, name')
      .eq('parent_id', rootFolder.id)
      .eq('agent_id', agentId)
      .maybeSingle();

    if (!subfolder) {
      const { data: created, error } = await admin
        .from('agent_folders')
        .insert({ agent_id: agentId, name: agentName, parent_id: rootFolder.id, organization_id: orgId })
        .select('id, name')
        .single();
      if (error) throw error;
      subfolder = created;
    }

    return { rootFolder, subfolder };
  };
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/**
 * Onboard the whole roster into the org. Continues past per-member failures
 * so one bad email doesn't block the other seven.
 *
 * @returns {{ results: array, failures: number }}
 */
export async function onboardRoster(admin, org, roster, { dryRun = false, sendInviteEmails = true, deps = {}, invite = inviteAgent, log = console.log } = {}) {
  const results = [];
  let failures = 0;

  for (const member of roster) {
    const label = `${member.fullName} <${member.email}>`;
    try {
      const plan = await planMember(admin, org.id, member);

      if (plan.action === 'skip') {
        log(`  = ${label} — already an active member (${plan.membership.role}), skipping`);
        results.push({ ...member, action: 'skip', ok: true });
        continue;
      }
      if (plan.action === 'conflict') {
        log(`  ! ${label} — already belongs to another organization (${plan.profile.organization_id}); resolve manually`);
        results.push({ ...member, action: 'conflict', ok: false });
        failures += 1;
        continue;
      }

      if (dryRun) {
        log(`  ~ ${label} — would ${plan.action} as ${member.membershipRole} (${member.title})`);
        results.push({ ...member, action: plan.action, ok: true, dryRun: true });
        continue;
      }

      const { agent, created, tempPassword } = await invite(admin, {
        email: member.email,
        fullName: member.fullName,
        organizationId: org.id,
        membershipRole: member.membershipRole,
        autoEnsureOrg: false,
        sendInvite: sendInviteEmails,
        extraAgentFields: {
          agent_company: COMPANY_NAME,
          agent_country: 'France',
          agent_specialty: member.title,
        },
      }, deps);

      log(`  ✓ ${label} — ${created ? 'account created' : 'existing account added to org'} as ${member.membershipRole}`);
      results.push({ ...member, action: created ? 'create' : plan.action, ok: true, profileId: agent?.id || null, tempPassword });
    } catch (err) {
      log(`  ✗ ${label} — FAILED: ${err.message}`);
      results.push({ ...member, action: 'error', ok: false, error: err.message });
      failures += 1;
    }
  }

  return { results, failures };
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noEmail = args.includes('--no-email');
  const orgIdFlag = args.includes('--org-id') ? args[args.indexOf('--org-id') + 1] : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    console.error('Run with:  node --env-file=.env scripts/onboard-showroom-accestory.mjs --dry-run');
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY && !noEmail && !dryRun) {
    console.warn('⚠ RESEND_API_KEY is not set — accounts will be created but welcome emails will NOT go out.');
    console.warn('  Temp passwords are printed below so you can forward them manually.\n');
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Resolve the target organization
  const { org, candidates, reason } = await resolveOrganization(admin, { orgId: orgIdFlag });
  if (!org) {
    console.error(`Could not resolve the organization: ${reason}`);
    if (candidates.length) {
      console.error('Matches found:');
      for (const c of candidates) console.error(`  - ${c.name}  (${c.id})`);
    } else {
      const { data: allOrgs } = await admin.from('organizations').select('id, name').order('name');
      console.error('Existing organizations:');
      for (const c of allOrgs || []) console.error(`  - ${c.name}  (${c.id})`);
      console.error('\nIf the Showroom Accestory org does not exist yet, create it first');
      console.error('(invite the main agent from /admin/agents — an org is auto-created),');
      console.error('then re-run this script with --org-id <uuid>.');
    }
    process.exit(1);
  }

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Target organization: ${org.name} (${org.id})`);
  if (org.commission_rate != null) console.log(`Org commission rate: ${org.commission_rate}% (members inherit it — no per-member override set)`);

  // 2. Show current members for context
  const { data: currentMembers } = await admin
    .from('organization_memberships')
    .select('role, deleted_at, profiles:user_id (email, full_name, agent_status)')
    .eq('organization_id', org.id)
    .is('deleted_at', null);
  console.log(`Current active members: ${currentMembers?.length || 0}`);
  for (const m of currentMembers || []) {
    console.log(`  - ${m.profiles?.full_name || m.profiles?.email} (${m.role}, ${m.profiles?.agent_status || 'n/a'})`);
  }

  // 3. Onboard the roster
  console.log(`\n${dryRun ? 'Planned actions' : 'Onboarding'} (${ROSTER.length} people):`);
  const deps = {
    sendEmail: makeSendEmail(),
    provisionAgentInOrg: makeProvisionAgentInOrg(admin),
    autoEnsureOrganization: async () => {
      throw new Error('autoEnsureOrganization must never run here (organizationId is always set)');
    },
  };
  const { results, failures } = await onboardRoster(admin, org, ROSTER, {
    dryRun,
    sendInviteEmails: !noEmail,
    deps,
  });

  // 4. Summary + credentials fallback
  console.log('\n--- SUMMARY ---');
  console.log(`  ok: ${results.filter((r) => r.ok).length} / ${results.length}   failures: ${failures}${dryRun ? '   (dry run — nothing written)' : ''}`);

  const withPasswords = results.filter((r) => r.tempPassword);
  if (withPasswords.length) {
    const emailsWentOut = !noEmail && !!process.env.RESEND_API_KEY;
    console.log(emailsWentOut
      ? '\nTemp passwords (already emailed — keep as backup, forward privately if someone loses the email):'
      : '\nTemp passwords (emails NOT sent — forward these privately):');
    for (const r of withPasswords) console.log(`  ${r.email}  →  ${r.tempPassword}`);
    console.log('\nEveryone signs in at /login and is forced to choose their own password on first login.');
  }

  process.exit(failures > 0 ? 1 : 0);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
