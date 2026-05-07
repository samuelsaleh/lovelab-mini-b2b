/**
 * Phase 19/B6 — Upload a generated commission Excel to Google Drive.
 *
 * Folder structure (Sam's setup):
 *   <root>/                       ← env GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID
 *   ├── 2026/                     ← year folder (manually created or auto)
 *   │   ├── January/              ← English (auto-created if missing)
 *   │   ├── Mai/                  ← French ALSO accepted (Sam's existing)
 *   │   ├── Mei/                  ← Dutch ALSO accepted
 *   │   └── ...
 *   └── 2027/
 *       └── ...
 *
 * The env var can point at EITHER:
 *   - The PARENT-OF-YEARS folder (e.g. "Agents") — system auto-creates 2026/, 2027/...
 *   - The YEAR folder directly (e.g. "2026") — system drops month folders inside.
 *     Update the env var yearly OR move to parent-of-years for full auto.
 *
 * Auto-detection:
 *   - We first look for a `<year>` subfolder inside <root>. If found, drill in.
 *   - Otherwise we fetch <root>'s name. If it starts with the period's year
 *     (e.g. "2026" or "2026 — Agents"), we treat it as the year folder.
 *   - Else we treat <root> as parent-of-years and auto-create the year subfolder.
 *
 * Multilingual month matching:
 *   - For each month we know the English / French / Dutch names.
 *   - We do ONE Drive search using `(name='May' or name='Mai' or name='Mei')`
 *     and use the first match. If none exist, we create one with the
 *     English name.
 *
 * Failures are NOT thrown by default — they are returned in the result
 * so the caller can decide whether to fail the whole report flow or
 * proceed (e.g. Supabase Storage upload + email succeeded, Drive failed).
 */

import {
  uploadFileToDrive,
  findFolderByAnyName,
  getOrCreateSubfolder,
  getFolderInfo,
} from './google-drive.js';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Month aliases — ordered by preference. The first entry is the
 * "canonical" English name we'll create when the folder is missing.
 *
 * Add more candidates here if Sam ever uses other spellings.
 */
const MONTH_ALIASES = {
  1:  ['January',   'Janvier',   'Januari'],
  2:  ['February',  'Février',   'Februari'],
  3:  ['March',     'Mars',      'Maart'],
  4:  ['April',     'Avril',     'April'],
  5:  ['May',       'Mai',       'Mei'],
  6:  ['June',      'Juin',      'Juni'],
  7:  ['July',      'Juillet',   'Juli'],
  8:  ['August',    'Août',      'Augustus'],
  9:  ['September', 'Septembre', 'September'],
  10: ['October',   'Octobre',   'Oktober'],
  11: ['November',  'Novembre',  'November'],
  12: ['December',  'Décembre',  'December'],
};

/**
 * @param {object} args
 * @param {Buffer|Uint8Array} args.buffer       — the .xlsx bytes
 * @param {string}            args.agentName    — e.g. "Nicolas Vial"
 * @param {string}            args.periodLabel  — e.g. "May 2026"
 * @param {string}            args.periodKey    — e.g. "2026-05" (sortable)
 * @returns {Promise<{
 *   ok: boolean,
 *   skipped?: boolean,
 *   reason?: string,
 *   fileId?: string,
 *   folderId?: string,         // month folder where we uploaded
 *   folderName?: string,       // e.g. "Mai" or "May"
 *   yearFolderId?: string,     // resolved year folder
 *   yearFolderName?: string,
 *   createdMonthFolder?: boolean,
 *   webViewLink?: string,
 *   error?: string,
 * }>}
 */
export async function uploadCommissionReportToDrive({
  buffer,
  agentName,
  periodLabel,
  periodKey,
}) {
  const rootId = process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID;
  if (!rootId) {
    return {
      ok: false,
      skipped: true,
      reason: 'env_not_set',
      error: 'GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID is not set',
    };
  }
  if (!buffer || !agentName || !periodLabel || !periodKey) {
    return { ok: false, skipped: true, reason: 'missing_args' };
  }

  const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!m) {
    return {
      ok: false,
      skipped: true,
      reason: 'bad_period_key',
      error: `periodKey must be YYYY-MM, got "${periodKey}"`,
    };
  }
  const year = m[1];
  const monthNum = Number(m[2]);
  const aliases = MONTH_ALIASES[monthNum];
  if (!aliases) {
    return {
      ok: false,
      skipped: true,
      reason: 'bad_month',
      error: `Unknown month in periodKey "${periodKey}"`,
    };
  }

  try {
    // ── Step 1. Resolve the year folder ────────────────────────────────
    let yearFolder = await findFolderByAnyName(rootId, [year]);

    if (!yearFolder) {
      // Look at <root>'s own name. If it starts with the period's year,
      // treat the root itself as the year folder (Sam's current setup).
      const rootInfo = await getFolderInfo(rootId);
      const rootName = String(rootInfo?.name || '');
      if (rootName.startsWith(year)) {
        yearFolder = { id: rootId, name: rootName };
      } else {
        // Otherwise create a `<year>` subfolder under root.
        const yearFolderId = await getOrCreateSubfolder(rootId, year);
        yearFolder = { id: yearFolderId, name: year };
      }
    }

    // ── Step 2. Resolve the month folder (multilingual) ────────────────
    let monthFolder = await findFolderByAnyName(yearFolder.id, aliases);
    let createdMonthFolder = false;

    if (!monthFolder) {
      const englishName = aliases[0];
      const monthFolderId = await getOrCreateSubfolder(yearFolder.id, englishName);
      monthFolder = { id: monthFolderId, name: englishName };
      createdMonthFolder = true;
    }

    // ── Step 3. Upload the .xlsx ───────────────────────────────────────
    const fileName = `${sanitiseFilenamePart(agentName)} - ${periodLabel}.xlsx`;
    const result = await uploadFileToDrive(monthFolder.id, fileName, buffer, XLSX_MIME);

    return {
      ok: true,
      fileId: result.id,
      folderId: monthFolder.id,
      folderName: monthFolder.name,
      yearFolderId: yearFolder.id,
      yearFolderName: yearFolder.name,
      createdMonthFolder,
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
