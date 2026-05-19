/**
 * Phase 22 (2026-05-13) — Upload a generated commission Excel to Google
 * Drive under the new per-agent folder structure.
 *
 * Folder structure (Sam's redesign):
 *   <root>/                            ← env GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID
 *   ├── Marc Schlund/
 *   │   ├── Marc Schlund - 2026-04.xlsx       (cron monthly)
 *   │   └── Marc Schlund - 2026-05-13-1422.xlsx  (manual snapshot)
 *   ├── Nicolas Vial/
 *   │   └── ...
 *   └── ...
 *
 * What we removed (intentionally):
 *   - Year folders (2026/, 2027/...)
 *   - Month folders (May/, Mai/, Mei/...)
 *   - The `MONTH_ALIASES` multilingual matcher
 *   - `findFolderByAnyName` / `getFolderInfo` walking
 *
 * Why: agents stay organised by who they are, not by when the report
 * fired. One folder per agent matches how mom already files contracts.
 *
 * IMPORTANT — Vercel env update required:
 *   `GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID` must now point at the
 *   parent-of-agent-folders, NOT at a year folder. The manual smoke test
 *   in the plan walks Sam through this.
 *
 * Folder resolution is delegated to `lib/agentDriveFolder.js` so the
 * agent-creation hook (POST /api/agents) and the report flow share the
 * same logic + caching contract (`profiles.drive_folder_id`).
 *
 * Failures are NOT thrown — they're returned in the result so the caller
 * can decide whether to fail the whole report flow or proceed.
 */

import { uploadFileToDrive } from './google-drive.js';
import { ensureAgentDriveFolder } from './agentDriveFolder.js';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * @param {object} args
 * @param {Buffer|Uint8Array} args.buffer        — the .xlsx bytes
 * @param {string}            args.agentName     — e.g. "Marc Schlund"
 * @param {string}            args.periodKey     — e.g. "2026-05" (cron)
 *                                                  or "2026-05-13-1422" (snapshot)
 * @param {string|null}       [args.cachedFolderId] — `profiles.drive_folder_id`
 *                              if already known; lets us skip the folder
 *                              lookup. Falsy → resolve via getOrCreateSubfolder.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   skipped?: boolean,
 *   reason?: string,
 *   fileId?: string,
 *   folderId?: string,         // per-agent folder where we uploaded
 *   folderFromCache?: boolean, // true if we used cachedFolderId
 *   webViewLink?: string,
 *   error?: string,
 * }>}
 */
export async function uploadCommissionReportToDrive({
  buffer,
  agentName,
  periodKey,
  cachedFolderId = null,
}) {
  if (!buffer || !agentName || !periodKey) {
    return { ok: false, skipped: true, reason: 'missing_args' };
  }

  // ── Step 1. Resolve the per-agent folder ──────────────────────────
  // env_not_set / no_name → the helper returns `{ skipped: true }` with
  // a clear reason. Pass that straight through so the caller sees the
  // same shape it used to under the old year/month code path.
  const folderRes = await ensureAgentDriveFolder({
    agentName,
    cachedFolderId,
  });

  if (folderRes.skipped) {
    return {
      ok: false,
      skipped: true,
      reason: folderRes.reason,
      error:
        folderRes.reason === 'env_not_set'
          ? 'GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID is not set'
          : `Cannot upload to Drive: ${folderRes.reason}`,
    };
  }

  if (folderRes.error || !folderRes.folderId) {
    return {
      ok: false,
      skipped: false,
      reason: 'folder_resolve_failed',
      error: folderRes.error || 'Failed to resolve agent Drive folder',
    };
  }

  // ── Step 2. Upload the .xlsx ──────────────────────────────────────
  // Filename uses period.key so two same-day snapshot exports don't
  // clobber each other (snapshot key carries HHmm), and monthly cron
  // exports stay readable ("Marc Schlund - 2026-04.xlsx").
  const fileName = `${sanitiseFilenamePart(agentName)} - ${periodKey}.xlsx`;
  try {
    const result = await uploadFileToDrive(folderRes.folderId, fileName, buffer, XLSX_MIME);
    return {
      ok: true,
      fileId: result.id,
      folderId: folderRes.folderId,
      folderFromCache: !!folderRes.fromCache,
      webViewLink: result.id
        ? `https://drive.google.com/file/d/${result.id}/view`
        : null,
    };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      reason: 'drive_upload_failed',
      error: err?.message || String(err),
    };
  }
}

/**
 * Strip characters that Drive accepts but most filesystems / users don't
 * want in a filename. Slashes are the main concern.
 */
function sanitiseFilenamePart(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
