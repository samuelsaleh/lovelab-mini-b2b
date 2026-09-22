/**
 * Who receives a price list announcement, and in which language.
 *
 * Recipients are agents (profiles with is_agent or an agent status) that are
 * active or paused — paused agents need the new prices when they resume.
 * Invited agents have not signed in yet; inactive and deleted ones are gone.
 * Commercials are agent rows with role 'admin', so they are included; plain
 * admins who are not agents are not.
 *
 * Server-side (takes the service-role client) but free of Next imports so
 * the grouping can be unit-tested.
 */
import { resolveAgentLanguage, languageSource } from '@/lib/agents/language';

export const ANNOUNCE_STATUSES = ['active', 'paused'];

const SELECT_WITH_LANGUAGE = 'id, email, full_name, role, is_agent, agent_status, agent_country, agent_language';
const SELECT_WITHOUT_LANGUAGE = 'id, email, full_name, role, is_agent, agent_status, agent_country';

function query(adminSupabase, cols) {
  return adminSupabase
    .from('profiles')
    .select(cols)
    .or(`is_agent.eq.true,agent_status.in.(${ANNOUNCE_STATUSES.join(',')})`)
    .is('agent_deleted_at', null);
}

/**
 * Every profile eligible for an announcement, as stored. Falls back to a
 * select without agent_language when that column has not been migrated yet
 * (everyone then derives their language from their country).
 */
export async function loadAnnouncementRecipients(adminSupabase) {
  let { data, error } = await query(adminSupabase, SELECT_WITH_LANGUAGE);
  if (error) {
    ({ data, error } = await query(adminSupabase, SELECT_WITHOUT_LANGUAGE));
  }
  if (error) throw new Error(`Failed to load agents: ${error.message}`);
  return (data || []).filter((p) => ANNOUNCE_STATUSES.includes(p.agent_status));
}

/** One recipient row as the API and the modal see it. */
export function describeRecipient(profile) {
  return {
    id: profile.id,
    email: String(profile.email || '').trim().toLowerCase() || null,
    name: profile.full_name || '',
    status: profile.agent_status || null,
    role: profile.role || 'member',
    language: resolveAgentLanguage(profile),
    languageSource: languageSource(profile),
  };
}

/**
 * Group eligible profiles by the language they will be written to in.
 *
 * @returns {{
 *   recipients: object[],
 *   byLanguage: Record<string, object[]>,
 *   counts: Record<string, number>,
 *   fallbackToEnglish: object[],   // no stored language, country gave nothing → English by default
 *   derivedFromCountry: object[],  // no stored language, country decided
 *   missingEmail: object[],        // cannot be emailed at all
 * }}
 */
export function groupRecipientsByLanguage(profiles) {
  const recipients = [];
  const byLanguage = {};
  const counts = {};
  const fallbackToEnglish = [];
  const derivedFromCountry = [];
  const missingEmail = [];

  for (const profile of profiles || []) {
    const r = describeRecipient(profile);
    if (!r.email) {
      missingEmail.push(r);
      continue;
    }
    recipients.push(r);
    (byLanguage[r.language] ||= []).push(r);
    counts[r.language] = (counts[r.language] || 0) + 1;
    if (r.languageSource === 'default') fallbackToEnglish.push(r);
    if (r.languageSource === 'country') derivedFromCountry.push(r);
  }

  for (const list of Object.values(byLanguage)) {
    list.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  }

  return { recipients, byLanguage, counts, fallbackToEnglish, derivedFromCountry, missingEmail };
}
