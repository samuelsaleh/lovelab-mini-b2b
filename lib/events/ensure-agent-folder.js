/**
 * Ensure an agent has an `events` row of type='agent' (the folder that
 * powers the "@ Agent Name" tag on POs and the Fairs / Documents folder view).
 *
 * Invite historically only created `agent_folders` (drive tree) + org/membership,
 * never this events row — so a brand-new agent's first order landed in
 * "No Event" until an admin opened SaveDocumentModal (admin-only auto-create).
 * Sam July 2026: this must never happen again.
 *
 * Relative imports so node:test / jest can load this without Next path aliases.
 *
 * Resolution (same order as resolveAgentFolderEventId historically):
 *   1. Existing agent-type event linked to one of the user's orgs
 *   2. Existing agent-type event created_by the user (email-reconciled)
 *   3. Create one: name = full_name || email, type=agent, organization_id if known
 *
 * Dedup: one agent folder per organization (shared by sub-agents).
 */

import { normalizeEmail } from '../auth/validation.js';

async function resolveUserIds(adminSupabase, userId) {
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.email) return [userId];
  const email = normalizeEmail(profile.email);
  if (!email) return [userId];
  const { data: all } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('email', email);
  const ids = (all || []).map((r) => r.id).filter(Boolean);
  return ids.length > 0 ? ids : [userId];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {string} userId
 * @returns {Promise<string|null>} event id, or null if the user/profile is missing
 */
export async function ensureAgentFolderEvent(adminSupabase, userId) {
  if (!userId) return null;

  const { data: profile, error: profileErr } = await adminSupabase
    .from('profiles')
    .select('id, full_name, email, organization_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileErr) {
    console.error('[ensureAgentFolderEvent] profile lookup failed:', profileErr.message);
    return null;
  }
  if (!profile) return null;

  const userIds = await resolveUserIds(adminSupabase, userId);

  const { data: memberships } = await adminSupabase
    .from('organization_memberships')
    .select('organization_id')
    .in('user_id', userIds)
    .is('deleted_at', null);

  const orgIds = new Set((memberships || []).map((m) => m.organization_id).filter(Boolean));
  if (profile.organization_id) orgIds.add(profile.organization_id);

  if (orgIds.size > 0) {
    const { data: orgFolders, error: orgErr } = await adminSupabase
      .from('events')
      .select('id')
      .eq('type', 'agent')
      .in('organization_id', [...orgIds])
      .limit(1);
    if (orgErr) {
      console.error('[ensureAgentFolderEvent] org folder lookup failed:', orgErr.message);
    } else if (orgFolders?.[0]?.id) {
      return orgFolders[0].id;
    }
  }

  const { data: ownFolders, error: ownErr } = await adminSupabase
    .from('events')
    .select('id')
    .eq('type', 'agent')
    .in('created_by', userIds)
    .limit(1);
  if (ownErr) {
    console.error('[ensureAgentFolderEvent] own folder lookup failed:', ownErr.message);
  } else if (ownFolders?.[0]?.id) {
    return ownFolders[0].id;
  }

  const folderName = (profile.full_name || '').trim() || (profile.email || '').trim();
  if (!folderName) {
    console.error('[ensureAgentFolderEvent] cannot create folder — empty name for', userId);
    return null;
  }

  // Prefer the profile's organization_id; else the first active membership.
  const targetOrgId = profile.organization_id || [...orgIds][0] || null;

  // Race-safe: re-check org dedup right before insert (two concurrent first-saves).
  if (targetOrgId) {
    const { data: raceCheck } = await adminSupabase
      .from('events')
      .select('id')
      .eq('type', 'agent')
      .eq('organization_id', targetOrgId)
      .limit(1);
    if (raceCheck?.[0]?.id) return raceCheck[0].id;
  }

  const { data: created, error: insertErr } = await adminSupabase
    .from('events')
    .insert({
      name: folderName,
      type: 'agent',
      organization_id: targetOrgId,
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertErr) {
    // Unique race: another request may have created it — re-lookup.
    console.error('[ensureAgentFolderEvent] insert failed:', insertErr.message);
    if (targetOrgId) {
      const { data: afterRace } = await adminSupabase
        .from('events')
        .select('id')
        .eq('type', 'agent')
        .eq('organization_id', targetOrgId)
        .limit(1);
      if (afterRace?.[0]?.id) return afterRace[0].id;
    }
    return null;
  }

  return created?.id || null;
}
