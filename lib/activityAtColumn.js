/**
 * Runtime guard for documents.activity_at (added by
 * supabase/migrations/20260912120000_documents_activity_at.sql).
 *
 * Write and list routes must NOT reference activity_at until the migration
 * is applied, otherwise every re-edit save and document list would fail with
 * "column activity_at does not exist". Probe once per process and cache,
 * same pattern as documentsHaveAgentIdColumn.
 */

let cached = null;

export async function documentsHaveActivityAtColumn(adminSupabase) {
  if (cached !== null) return cached;
  try {
    const query = adminSupabase.from('documents').select('activity_at');
    if (!query || typeof query.limit !== 'function') {
      cached = false;
      return cached;
    }
    const { error } = await query.limit(1);
    cached = !error;
  } catch {
    cached = false;
  }
  return cached;
}
