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
    .maybeSingle();

  let effectiveProfile = profile || null;
  const userEmail = normalizeEmail(user.email);
  if (!effectiveProfile && userEmail) {
    const { data: emailProfile } = await adminSupabase
      .from('profiles')
      .select('id, role, is_agent, full_name, email')
      .eq('email', userEmail)
      .maybeSingle();
    effectiveProfile = emailProfile || null;
  }

  return {
    user,
    profile: effectiveProfile,
    isAdmin: effectiveProfile?.role === 'admin',
  };
}

export async function getEventPermission(adminSupabase, eventId, userId, isAdmin = false) {
  if (!eventId || !userId) return null;
  if (isAdmin) return 'manage';

  const { data: eventRow } = await adminSupabase
    .from('events')
    .select('id, created_by')
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

  return shareRow?.permission || null;
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

// Returns all profile IDs that share the same email as `agentId`.
// Handles re-invited agents whose auth user ID changed but email stayed the same.
export async function resolveAgentIds(adminSupabase, agentId) {
  if (!agentId) return [agentId];
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('email')
    .eq('id', agentId)
    .single();
  let email = normalizeEmail(profile?.email);
  if (!email) {
    try {
      const authLookup = await adminSupabase.auth?.admin?.getUserById?.(agentId);
      email = normalizeEmail(authLookup?.data?.user?.email);
    } catch (err) {
      console.error('[access] auth user email lookup error:', err?.message || err);
    }
  }
  if (!email) return [agentId];
  const { data: all } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('email', email);
  const ids = Array.from(new Set([agentId, ...(all || []).map((r) => r.id)]));
  return ids.length > 0 ? ids : [agentId];
}
