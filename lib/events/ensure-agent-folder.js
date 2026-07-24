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
 * Resolution:
 *   1. Existing agent-type event whose name matches the profile (preferred —
 *      so Wassila gets "@ Wassila Mekidiche", not Sarah's org folder)
 *   2. Existing agent-type event created_by the user (email-reconciled)
 *   3. Create one: name = full_name || email, type=agent, organization_id if known
 *
 * Multi-member orgs may have many agent folders sharing organization_id.
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

function nameKey(value) {
  return (value || '').trim().toLowerCase();
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
  const folderName = (profile.full_name || '').trim() || (profile.email || '').trim();
  const wantName = nameKey(folderName);

  const { data: memberships } = await adminSupabase
    .from('organization_memberships')
    .select('organization_id')
    .in('user_id', userIds)
    .is('deleted_at', null);

  const orgIds = new Set((memberships || []).map((m) => m.organization_id).filter(Boolean));
  if (profile.organization_id) orgIds.add(profile.organization_id);

  // Prefer a folder whose name matches this agent (personal folder).
  if (wantName && orgIds.size > 0) {
    const { data: orgFolders, error: orgErr } = await adminSupabase
      .from('events')
      .select('id, name')
      .eq('type', 'agent')
      .in('organization_id', [...orgIds]);
    if (orgErr) {
      console.error('[ensureAgentFolderEvent] org folder lookup failed:', orgErr.message);
    } else {
      const byName = (orgFolders || []).find((f) => nameKey(f.name) === wantName);
      if (byName?.id) return byName.id;
    }
  } else if (wantName) {
    const { data: named } = await adminSupabase
      .from('events')
      .select('id')
      .eq('type', 'agent')
      .ilike('name', folderName)
      .limit(5);
    const exact = (named || []).find((f) => nameKey(f.name) === wantName);
    if (exact?.id) return exact.id;
  }

  const { data: ownFolders, error: ownErr } = await adminSupabase
    .from('events')
    .select('id, name')
    .eq('type', 'agent')
    .in('created_by', userIds);
  if (ownErr) {
    console.error('[ensureAgentFolderEvent] own folder lookup failed:', ownErr.message);
  } else {
    const byName = (ownFolders || []).find((f) => nameKey(f.name) === wantName);
    if (byName?.id) return byName.id;
    if (ownFolders?.[0]?.id) return ownFolders[0].id;
  }

  if (!folderName) {
    console.error('[ensureAgentFolderEvent] cannot create folder — empty name for', userId);
    return null;
  }

  const targetOrgId = profile.organization_id || [...orgIds][0] || null;

  // Race-safe: re-check by name (+ org) right before insert.
  if (targetOrgId) {
    const { data: raceCheck } = await adminSupabase
      .from('events')
      .select('id, name')
      .eq('type', 'agent')
      .eq('organization_id', targetOrgId);
    const hit = (raceCheck || []).find((f) => nameKey(f.name) === wantName);
    if (hit?.id) return hit.id;
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
    console.error('[ensureAgentFolderEvent] insert failed:', insertErr.message);
    if (targetOrgId) {
      const { data: afterRace } = await adminSupabase
        .from('events')
        .select('id, name')
        .eq('type', 'agent')
        .eq('organization_id', targetOrgId);
      const hit = (afterRace || []).find((f) => nameKey(f.name) === wantName);
      if (hit?.id) return hit.id;
    }
    return null;
  }

  return created?.id || null;
}
