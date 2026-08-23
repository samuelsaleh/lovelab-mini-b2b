/**
 * Helpers for the pack_fairs and pack_hidden join tables (Phase 34).
 *
 * pack_fairs  — which trade fairs a pack is filed under. Many-to-many: one pack
 *               can sit in several fairs. The assignment is SHARED: everybody
 *               sees the same folder contents, and any signed-in user may file
 *               or unfile a pack. It never changes who can *see* a pack —
 *               packs.scope + pack_visibility still decide that.
 *
 * pack_hidden — a per-user hide list. Hiding a pack only removes it from that
 *               person's own Builder strip. RLS restricts every row to
 *               user_id = auth.uid(), so these helpers work with either the
 *               user-context or the admin client.
 */

/** A fair is an events row with this type. */
export const FAIR_EVENT_TYPE = 'fair'

// Raised when the Phase 34 migration has not been applied to this database yet.
// 42P01 is Postgres "undefined_table"; PGRST205 is PostgREST failing to find the
// table in its schema cache, which is what Supabase actually returns.
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

/** Preserve the Postgres/PostgREST error code through the throw. */
function dbError(error) {
  const err = new Error(error.message)
  if (error.code) err.code = error.code
  return err
}

/**
 * True when a failure is "these tables don't exist yet" rather than a genuine
 * problem. Callers use it to tell the user the feature isn't installed instead
 * of reporting a meaningless generic error — a distinction worth making, since
 * the two need completely different fixes.
 */
export function isMissingTableError(err) {
  if (!err) return false
  if (err.code && MISSING_TABLE_CODES.has(err.code)) return true
  return /could not find the table|relation .* does not exist/i.test(err.message || '')
}

function uniqueIds(ids) {
  return Array.isArray(ids)
    ? [...new Set(ids.filter((id) => typeof id === 'string' && id))]
    : []
}

/**
 * Replace the full set of fairs a pack is filed under. Passing an empty (or
 * missing) list unfiles the pack everywhere.
 *
 * `addedBy` is stored for audit only — it is never used to gate access, since
 * anyone may re-file the pack afterwards.
 */
export async function syncPackFairs(adminSupabase, packId, eventIds, addedBy = null) {
  const ids = uniqueIds(eventIds)

  // Replace the set: delete existing rows, then insert the new ones.
  const { error: delErr } = await adminSupabase
    .from('pack_fairs')
    .delete()
    .eq('pack_id', packId)
  if (delErr) throw dbError(delErr)

  if (ids.length === 0) return

  const rows = ids.map((event_id) => ({
    pack_id: packId,
    event_id,
    ...(addedBy ? { added_by: addedBy } : {}),
  }))
  const { error: insErr } = await adminSupabase
    .from('pack_fairs')
    .insert(rows)
  if (insErr) throw dbError(insErr)
}

/**
 * Return a map of { [pack_id]: [event_id, ...] } for the given pack ids, so the
 * pack list can tell the UI which folder each card belongs to.
 */
export async function fetchFairIdsForPacks(supabase, packIds) {
  const map = {}
  const ids = uniqueIds(packIds)
  if (ids.length === 0) return map

  const { data, error } = await supabase
    .from('pack_fairs')
    .select('pack_id, event_id')
    .in('pack_id', ids)
  if (error) throw dbError(error)

  for (const row of data || []) {
    if (!map[row.pack_id]) map[row.pack_id] = []
    map[row.pack_id].push(row.event_id)
  }
  return map
}

/**
 * Return the set of pack ids this user has personally hidden. Always filtered
 * by user_id explicitly so it is correct with the admin client too (which
 * bypasses RLS).
 */
export async function fetchHiddenPackIds(supabase, userId) {
  if (!userId) return new Set()

  const { data, error } = await supabase
    .from('pack_hidden')
    .select('pack_id')
    .eq('user_id', userId)
  if (error) throw dbError(error)

  return new Set((data || []).map((r) => r.pack_id))
}

/**
 * Hide or unhide a pack for one user. Idempotent in both directions: hiding an
 * already-hidden pack and unhiding a visible one are both no-ops.
 */
export async function setPackHidden(supabase, packId, userId, hidden) {
  if (!packId || !userId) throw new Error('packId and userId are required')

  if (hidden) {
    const { error } = await supabase
      .from('pack_hidden')
      .upsert({ pack_id: packId, user_id: userId }, { onConflict: 'pack_id,user_id' })
    if (error) throw dbError(error)
    return
  }

  const { error } = await supabase
    .from('pack_hidden')
    .delete()
    .eq('pack_id', packId)
    .eq('user_id', userId)
  if (error) throw dbError(error)
}

/**
 * Return the set of pack ids this user has pinned. Mirror of
 * fetchHiddenPackIds — always filtered by user_id explicitly so it stays correct
 * with the RLS-bypassing admin client too.
 */
export async function fetchPinnedPackIds(supabase, userId) {
  if (!userId) return new Set()

  const { data, error } = await supabase
    .from('pack_pinned')
    .select('pack_id')
    .eq('user_id', userId)
  if (error) throw dbError(error)

  return new Set((data || []).map((r) => r.pack_id))
}

/**
 * Pin or unpin a pack for one user. Idempotent in both directions.
 */
export async function setPackPinned(supabase, packId, userId, pinned) {
  if (!packId || !userId) throw new Error('packId and userId are required')

  if (pinned) {
    const { error } = await supabase
      .from('pack_pinned')
      .upsert({ pack_id: packId, user_id: userId }, { onConflict: 'pack_id,user_id' })
    if (error) throw dbError(error)
    return
  }

  const { error } = await supabase
    .from('pack_pinned')
    .delete()
    .eq('pack_id', packId)
    .eq('user_id', userId)
  if (error) throw dbError(error)
}

/**
 * List every trade fair with the number of packs filed under it, for the
 * Builder folder chips and the pack editor checkboxes.
 *
 * Deliberately NOT scoped by event_access: pack-to-fair filing is shared
 * org-wide, so every agent must be able to see the folder names even for fairs
 * they were never granted document access to.
 */
export async function fetchFairsWithPackCounts(adminSupabase) {
  const { data: events, error } = await adminSupabase
    .from('events')
    .select('id, name, start_date, end_date, created_by')
    .eq('type', FAIR_EVENT_TYPE)
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
  if (error) throw dbError(error)

  const fairs = events || []
  if (fairs.length === 0) return []

  // Counts are best-effort. Before the Phase 34 migration is applied the join
  // table doesn't exist, and the folder NAMES (which come from events) are still
  // useful on their own — failing the whole list would hide the folders too.
  const counts = {}
  const { data: links, error: linkErr } = await adminSupabase
    .from('pack_fairs')
    .select('event_id')
  if (linkErr && !isMissingTableError(dbError(linkErr))) throw dbError(linkErr)
  for (const row of links || []) {
    counts[row.event_id] = (counts[row.event_id] || 0) + 1
  }

  // Document counts exist so the UI can refuse to delete a folder that still
  // holds orders. Deliberately UNFILTERED — unlike the sidebar count, which
  // hides internal/consignment/deleted rows. Deleting the event would unfile
  // those too, so for a "is this safe to remove" check they all count.
  //
  // If the count can't be read we return null rather than 0, and the caller
  // must treat null as "unknown, so don't offer to delete". A failed query
  // reading as "empty" is exactly how you delete a folder full of orders.
  let docCounts = null
  const { data: docs, error: docErr } = await adminSupabase
    .from('documents')
    .select('event_id')
    .in('event_id', fairs.map((f) => f.id))
  if (docErr) {
    console.warn('[packFairs] document count failed:', docErr.message)
  } else {
    docCounts = {}
    for (const row of docs || []) {
      if (row.event_id) docCounts[row.event_id] = (docCounts[row.event_id] || 0) + 1
    }
  }

  return fairs.map((f) => ({
    ...f,
    pack_count: counts[f.id] || 0,
    doc_count: docCounts ? (docCounts[f.id] || 0) : null,
  }))
}

/**
 * Validate that every id is an existing fair. Returns the list of ids that are
 * NOT fairs so the caller can reject the request with a useful message.
 */
export async function findNonFairEventIds(adminSupabase, eventIds) {
  const ids = uniqueIds(eventIds)
  if (ids.length === 0) return []

  const { data, error } = await adminSupabase
    .from('events')
    .select('id')
    .eq('type', FAIR_EVENT_TYPE)
    .in('id', ids)
  if (error) throw dbError(error)

  const known = new Set((data || []).map((r) => r.id))
  return ids.filter((id) => !known.has(id))
}
