/**
 * Centralized helpers for managing agent access via the allowed_emails table.
 *
 * These functions keep allowed_emails in sync whenever an agent is
 * created, restored, or deleted. Using helpers here ensures all call
 * sites behave consistently and the logic lives in one place.
 */

/**
 * Grants login access by upserting the email into allowed_emails.
 * Safe to call multiple times (idempotent via onConflict).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {string} email
 */
export async function grantAccess(adminSupabase, email) {
  const normalized = email.trim().toLowerCase();
  const { error } = await adminSupabase
    .from('allowed_emails')
    .upsert({ email: normalized }, { onConflict: 'email' });
  if (error) {
    throw new Error(`[grantAccess] Failed to upsert allowed_emails for ${normalized}: ${error.message}`);
  }
}

/**
 * Revokes login access by removing the email from allowed_emails.
 * Safe to call even if the email is not present (no-op).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {string} email
 */
export async function revokeAccess(adminSupabase, email) {
  const normalized = email.trim().toLowerCase();
  const { error } = await adminSupabase
    .from('allowed_emails')
    .delete()
    .eq('email', normalized);
  if (error) {
    throw new Error(`[revokeAccess] Failed to delete from allowed_emails for ${normalized}: ${error.message}`);
  }
}
