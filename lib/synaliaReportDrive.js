/**
 * Upload SYNALIA quarterly report to the dedicated Google Drive folder.
 */

import { uploadFileToDrive } from './google-drive.js';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * @param {{ buffer: Buffer, fileName: string }} args
 */
export async function uploadSynaliaReportToDrive({ buffer, fileName }) {
  const folderId = process.env.GOOGLE_DRIVE_SYNALIA_REPORTS_FOLDER_ID;
  if (!folderId) {
    return { ok: false, skipped: true, reason: 'GOOGLE_DRIVE_SYNALIA_REPORTS_FOLDER_ID is not set' };
  }
  if (!buffer || !fileName) {
    return { ok: false, skipped: true, reason: 'missing_args' };
  }

  try {
    const result = await uploadFileToDrive(folderId, fileName, buffer, XLSX_MIME);
    return {
      ok: true,
      fileId: result.id,
      webViewLink: result.id ? `https://drive.google.com/file/d/${result.id}/view` : null,
    };
  } catch (err) {
    return { ok: false, error: err.message || 'Drive upload failed' };
  }
}
