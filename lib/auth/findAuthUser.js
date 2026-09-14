/**
 * Find a Supabase auth user by email address.
 *
 * Why this exists (14 Sep 2026): every invite path used to call
 * `auth.admin.listUsers({ filter: 'email.eq.…', perPage: 1 })`. supabase-js
 * only sends `page` and `per_page` — the `filter` key is dropped — so that
 * call returned the single oldest user in the project, and the lookup only
 * "worked" when that happened to be the invitee. Inviting an address that had
 * already signed in with Google then tried to create a second auth user and
 * failed. This pages through the admin list and matches on the address.
 *
 * Relative-import friendly (no '@/') so the node:test suites and the
 * one-shot scripts can use it too.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase - service-role client
 * @param {string} email
 * @param {{ perPage?: number, maxPages?: number }} [opts]
 * @returns {Promise<object|null>} the auth user, or null when absent or the API failed
 */
export async function findAuthUserByEmail(adminSupabase, email, { perPage = 1000, maxPages = 20 } = {}) {
  const wanted = String(email || '').trim().toLowerCase();
  if (!wanted) return null;

  for (let page = 1; page <= maxPages; page += 1) {
    let users;
    try {
      const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      users = data?.users || [];
    } catch (err) {
      console.warn('[findAuthUserByEmail] Auth user lookup warning:', err?.message || err);
      return null;
    }
    const match = users.find((u) => String(u.email || '').toLowerCase() === wanted);
    if (match) return match;
    if (users.length < perPage) return null;
  }
  return null;
}
