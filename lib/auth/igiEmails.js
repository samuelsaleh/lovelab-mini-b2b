/**
 * Who at IGI Antwerp may sign in.
 *
 * Sam, 10 Sept 2026: "if I tell you the emails, do they only see the relevant
 * things?" Yes — and the list of those emails lives in one place, the
 * IGI_EMAILS environment variable, the same way ADMIN_EMAILS names the admins.
 *
 * An address on this list signs in like anyone else and gets a profile marked
 * is_igi. From there lib/supabase/middleware.js refuses it everywhere except
 * the IGI portal. It is never an admin, whatever other list it appears on:
 * the narrower role wins.
 */
export function getIgiEmails(env = process.env) {
  return (env.IGI_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isIgiEmail(email, env = process.env) {
  if (!email) return false
  return getIgiEmails(env).includes(String(email).trim().toLowerCase())
}
