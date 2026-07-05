import { createAdminClient } from '@/lib/supabase/server';

const PERMISSION_RANK = {
  read: 1,
  edit: 2,
  manage: 3,
};

function isMissingTableError(err) {
  return err?.code === '42P01' || /does not exist/i.test(err?.message || '');
}

export async function getUserContext(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, isAdmin: false };

  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('id, role, is_agent, full_name, email')
    .eq('id', user.id)
    .single();

  return {
    user,
    profile: profile || null,
    isAdmin: profile?.role === 'admin',
  };
}

export async function getEventPermission(adminSupabase, eventId, userId, isAdmin = false) {
  if (!eventId || !userId) return null;
  if (isAdmin) return 'manage';

  const { data: eventRow } = await adminSupabase
    .from('events')
    .select('id, created_by, organization_id')
    .eq('id', eventId)
    .maybeSingle();

  if (!eventRow) return null;

  // Resolve all profile IDs sharing the same email (handles re-invited agents
  // whose auth user ID changed but whose events still reference the old ID).
  const userIds = await resolveAgentIds(adminSupabase, userId);
  if (userIds.includes(eventRow.created_by)) return 'manage';

  const { data: shareRow, error: shareErr } = await adminSupabase
    .from('event_access')
    .select('permission')
    .eq('event_id', eventId)
    .in('user_id', userIds)
    .maybeSingle();

  if (shareErr && !isMissingTableError(shareErr)) {
    console.error('[access] event_access read error:', shareErr.message);
  }

  if (shareRow?.permission) return shareRow.permission;

  // Team visibility: every active member of an organization can READ
  // (a) events explicitly linked to their org, and (b) events created by a
  // teammate who shares an active org with them.
  const myMemberships = await getActiveOrgMemberships(adminSupabase, userId);
  if (myMemberships.length > 0) {
    const myOrgIds = new Set(myMemberships.map((m) => m.organization_id));
    if (eventRow.organization_id && myOrgIds.has(eventRow.organization_id)) {
      return 'read';
    }
    if (eventRow.created_by) {
      const creatorMemberships = await getActiveOrgMemberships(adminSupabase, eventRow.created_by);
      if (creatorMemberships.some((m) => myOrgIds.has(m.organization_id))) {
        return 'read';
      }
    }
  }

  return null;
}

export async function requireEventPermission(adminSupabase, eventId, userId, required = 'read', isAdmin = false) {
  const actual = await getEventPermission(adminSupabase, eventId, userId, isAdmin);
  if (!actual) return { allowed: false, actual: null };
  return {
    allowed: (PERMISSION_RANK[actual] || 0) >= (PERMISSION_RANK[required] || 1),
    actual,
  };
}

export async function getAccessibleEventIds(adminSupabase, userId, isAdmin = false) {
  if (isAdmin) {
    const { data: allEvents } = await adminSupabase
      .from('events')
      .select('id');
    return (allEvents || []).map((e) => e.id);
  }

  const ids = new Set();

  const { data: ownedEvents } = await adminSupabase
    .from('events')
    .select('id')
    .eq('created_by', userId);
  (ownedEvents || []).forEach((e) => ids.add(e.id));

  const { data: sharedEvents, error: sharedErr } = await adminSupabase
    .from('event_access')
    .select('event_id')
    .eq('user_id', userId);

  if (sharedErr && !isMissingTableError(sharedErr)) {
    console.error('[access] event_access list error:', sharedErr.message);
  }

  (sharedEvents || []).forEach((row) => ids.add(row.event_id));
  return Array.from(ids);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Some users were re-invited and ended up with a new auth user ID.
// Allow ownership checks to pass when current user and owner share the same email.
export async function isUserOwnerOrSameEmail(adminSupabase, ownerUserId, currentUser) {
  if (!ownerUserId || !currentUser?.id) return false;
  if (ownerUserId === currentUser.id) return true;

  const { data: rows, error } = await adminSupabase
    .from('profiles')
    .select('id, email')
    .in('id', [ownerUserId, currentUser.id]);

  if (error) {
    console.error('[access] owner/email lookup error:', error.message);
    return false;
  }

  const ownerEmail = normalizeEmail((rows || []).find((r) => r.id === ownerUserId)?.email);
  const currentEmail = normalizeEmail(currentUser.email || (rows || []).find((r) => r.id === currentUser.id)?.email);
  return !!ownerEmail && ownerEmail === currentEmail;
}

// Returns the user's ACTIVE organization memberships (deleted_at IS NULL),
// resolved across all profile IDs sharing the user's email.
// Shape: [{ organization_id, role, user_id }]
export async function getActiveOrgMemberships(adminSupabase, userId) {
  if (!userId) return [];
  const userIds = await resolveAgentIds(adminSupabase, userId);
  const { data, error } = await adminSupabase
    .from('organization_memberships')
    .select('organization_id, role, user_id')
    .in('user_id', userIds)
    .is('deleted_at', null);
  if (error) {
    console.error('[access] org memberships read error:', error.message);
    return [];
  }
  return data || [];
}

// Team scope for an organization: every member profile ID (current AND
// historical — soft-deleted memberships stay in scope so a removed member's
// past orders remain in the team totals) plus the org's linked event IDs.
// Member IDs are email-reconciled the same way resolveAgentIds works.
export async function getOrgTeamScope(adminSupabase, organizationId) {
  if (!organizationId) return { memberIds: [], eventIds: [] };

  const [{ data: orgMembers }, { data: orgProfiles }, { data: orgEvents }] = await Promise.all([
    adminSupabase
      .from('organization_memberships')
      .select('user_id')
      .eq('organization_id', organizationId),
    adminSupabase
      .from('profiles')
      .select('id')
      .eq('organization_id', organizationId),
    adminSupabase
      .from('events')
      .select('id')
      .eq('organization_id', organizationId),
  ]);

  const memberIds = new Set([
    ...(orgMembers || []).map((m) => m.user_id),
    ...(orgProfiles || []).map((p) => p.id),
  ]);

  // Email reconciliation: re-invited agents may have legacy profile IDs whose
  // documents should still count for the team.
  const baseIds = [...memberIds].filter(Boolean);
  if (baseIds.length > 0) {
    const { data: memberProfiles } = await adminSupabase
      .from('profiles')
      .select('id, email')
      .in('id', baseIds);
    const emails = [...new Set(
      (memberProfiles || []).map((p) => normalizeEmail(p.email)).filter(Boolean)
    )];
    if (emails.length > 0) {
      const { data: sameEmailProfiles } = await adminSupabase
        .from('profiles')
        .select('id')
        .in('email', emails);
      (sameEmailProfiles || []).forEach((p) => memberIds.add(p.id));
    }
  }

  return {
    memberIds: [...memberIds].filter(Boolean),
    eventIds: (orgEvents || []).map((e) => e.id),
  };
}

// Returns all profile IDs that share the same email as `agentId`.
// Handles re-invited agents whose auth user ID changed but email stayed the same.
export async function resolveAgentIds(adminSupabase, agentId) {
  if (!agentId) return [agentId];
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('email')
    .eq('id', agentId)
    .single();
  if (!profile?.email) return [agentId];
  const email = normalizeEmail(profile.email);
  if (!email) return [agentId];
  const { data: all } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('email', email);
  const ids = (all || []).map((r) => r.id);
  return ids.length > 0 ? ids : [agentId];
}
