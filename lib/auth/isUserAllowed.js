/**
 * Access gate.
 *
 * A user may access the app if:
 *   1. Their email is in the `allowed_emails` table (internal team), OR
 *   2. They are an active/invited agent (is_agent=true, non-deleted, status in ALLOWED_AGENT_STATUSES), OR
 *   3. They are IGI Antwerp (is_igi=true) — another company, admitted only to
 *      their own five screens. Where they may go once inside is decided in
 *      lib/supabase/middleware.js, not here; this only says they may sign in.
 *
 * Paused and inactive agents are explicitly blocked.
 */

const ALLOWED_AGENT_STATUSES = ['active', 'invited'];

/**
 * @param {object} params
 * @param {boolean} params.isInAllowedEmails - whether the user's email exists in allowed_emails table
 * @param {object|null} params.agentProfile - profile row with is_agent, agent_status, agent_deleted_at, is_igi
 * @returns {boolean}
 */
export function isUserAllowed({ isInAllowedEmails, agentProfile }) {
  if (isInAllowedEmails) return true;
  if (!agentProfile) return false;
  if (agentProfile.is_igi === true) return true;
  return (
    agentProfile.is_agent === true &&
    !agentProfile.agent_deleted_at &&
    ALLOWED_AGENT_STATUSES.includes(agentProfile.agent_status)
  );
}
