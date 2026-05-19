/**
 * Phase 22 (2026-05-13) — Per-agent Google Drive folder resolver.
 *
 * Drops the previous `<root>/<year>/<month>/` tree (Phase 19 / B6) in
 * favour of a flatter `<root>/<Agent>/` structure. Sam's reasoning:
 *   - Easier to find a specific agent's history (one folder per person).
 *   - Survives renaming the workspace (no "did mom call it Mai or May?")
 *   - Aligns with how she already organises contracts/invoices on Drive.
 *
 * The env var `GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID` MUST be updated
 * to point at the parent-of-agent-folders, NOT at a year folder. The
 * Phase 22 manual smoke test calls this out explicitly.
 *
 * Tradeoff (documented intentionally):
 *   - We cache the resolved folder id on `profiles.drive_folder_id`. If
 *     mom later renames an agent in the DB (`profiles.full_name`), the
 *     Drive folder name won't follow — but the file still lands in the
 *     right place because the id is cached. This is the right tradeoff:
 *     stable plumbing > cosmetic name sync. If a rename later matters,
 *     a one-shot rename script can be added.
 *
 * Failure stance: any Drive failure returns `{ skipped/error }` instead
 * of throwing. Callers (POST /api/agents, generateAgentReport) wrap their
 * own try/catch on top so an unreachable Drive can never block the user.
 */

import { getOrCreateSubfolder } from './google-drive.js';

/**
 * Resolve (or create) the per-agent Drive folder.
 *
 * @param {object} args
 * @param {string} args.agentName       — display name for the folder.
 * @param {string|null} [args.cachedFolderId] — `profiles.drive_folder_id`
 *   if already known. When provided, we short-circuit and return it.
 *
 * @returns {Promise<{
 *   ok?: boolean,
 *   folderId?: string,
 *   fromCache?: boolean,
 *   skipped?: boolean,
 *   reason?: string,
 *   error?: string,
 * }>}
 *
 *   - `{ ok: true, folderId, fromCache: true }`  — `cachedFolderId` was
 *     truthy. We trust it; the caller doesn't need to re-persist.
 *   - `{ ok: true, folderId, fromCache: false }` — folder created or
 *     looked up by name. Caller SHOULD persist the id back to
 *     `profiles.drive_folder_id` to skip the lookup next time.
 *   - `{ skipped: true, reason: 'env_not_set' | 'no_name' }` — config
 *     is missing; the caller should treat this as a no-op (no email-flow
 *     interruption).
 *   - `{ skipped: false, error }` — a Drive API call threw. Caller decides
 *     whether to surface or continue.
 */
export async function ensureAgentDriveFolder({ agentName, cachedFolderId } = {}) {
  if (cachedFolderId) {
    return { ok: true, folderId: cachedFolderId, fromCache: true };
  }

  const rootId = process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID;
  if (!rootId) {
    return { skipped: true, reason: 'env_not_set' };
  }

  const trimmed = String(agentName || '').trim();
  if (!trimmed) {
    return { skipped: true, reason: 'no_name' };
  }

  const safeName = sanitisePart(trimmed);

  try {
    const folderId = await getOrCreateSubfolder(rootId, safeName);
    return { ok: true, folderId, fromCache: false };
  } catch (err) {
    return { skipped: false, error: err?.message || String(err) };
  }
}

/**
 * Strip characters that Drive accepts but most filesystems / users don't
 * want in a folder name. Slashes are the main concern. Mirrors the
 * sanitiser in commissionReportDrive.js so files + folder match exactly.
 */
export function sanitisePart(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
