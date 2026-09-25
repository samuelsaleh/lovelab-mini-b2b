/**
 * Put a monthly sales report PDF in the shared Google Drive folder Sam and
 * the executives read (Sam's choice of channel, 25/09/2026). Only the PDF
 * goes to Drive; the HTML is the email.
 *
 * The PDFs go straight into one folder (Rafi, 25/09/2026: "LoveLab
 * Analytics / Monthly Report" in his Drive), named so they sort by month:
 *   Monthly Report/                 ← env GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID
 *   ├── 2026-08 August — LoveLab sales report.pdf
 *   └── 2026-09 September — LoveLab sales report.pdf
 *
 * Uses the app's Google sign-in (lib/google-drive.js getAccessToken) but NOT
 * its folder helper: findOrCreateFolder permanently deletes same-named
 * duplicate folders, and in the executives' folder that could wipe a year of
 * reports. Here nothing is ever deleted or created apart from the PDF:
 *   - a PDF with the same name already there (a re-run, the final version
 *     of a partial month) → its content is replaced, no duplicate file
 *   - works in a normal folder and in a Workspace Shared drive
 *     (supportsAllDrives)
 *
 * Failures are returned, not thrown. Sample data is never uploaded.
 */

import { getAccessToken, hasDriveCredentials } from '../google-drive.js'

const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const ALL_DRIVES = 'supportsAllDrives=true'
const PDF_MIME = 'application/pdf'

export function salesReportFileName(report) {
  const partial = report.partial && report.dataThrough
    ? ` (partial, to ${new Date(`${report.dataThrough}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })})`
    : ''
  return `${report.month} ${report.monthLabel.split(' ')[0]} — LoveLab sales report${partial}.pdf`
}

const quote = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

async function driveJson(fetchFn, url, token, init = {}) {
  const res = await fetchFn(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } })
  if (!res.ok) throw new Error(`Drive ${init.method || 'GET'} failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/** The oldest non-trashed item with this name in this folder, or null. */
async function findOldest(fetchFn, token, parentId, name, mimeType) {
  const q = [`name = ${quote(name)}`, `${quote(parentId)} in parents`, 'trashed = false', mimeType ? `mimeType = ${quote(mimeType)}` : null].filter(Boolean).join(' and ')
  const url = `${FILES}?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=10&includeItemsFromAllDrives=true&${ALL_DRIVES}`
  const { files = [] } = await driveJson(fetchFn, url, token)
  return files[0] || null
}

async function putPdf(fetchFn, token, folderId, name, buffer) {
  const existing = await findOldest(fetchFn, token, folderId, name, null)
  if (existing) {
    const updated = await driveJson(fetchFn, `${UPLOAD}/${encodeURIComponent(existing.id)}?uploadType=media&${ALL_DRIVES}&fields=id`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': PDF_MIME },
      body: buffer,
    })
    return { id: updated.id || existing.id, replaced: true }
  }
  const boundary = `lovelab-sales-report-${Date.now()}`
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: PDF_MIME, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: ${PDF_MIME}\r\n\r\n`),
    Buffer.from(buffer),
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const created = await driveJson(fetchFn, `${UPLOAD}?uploadType=multipart&${ALL_DRIVES}&fields=id`, token, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return { id: created.id, replaced: false }
}

/**
 * @param {object} args
 * @param {Buffer} args.buffer   the PDF bytes
 * @param {object} args.report   from buildReportData
 * @param {object} [args.drive]  { hasDriveCredentials, getAccessToken, fetch } — injectable for tests
 */
export async function uploadSalesReportToDrive({ buffer, report, drive = { hasDriveCredentials, getAccessToken, fetch: (...a) => fetch(...a) } }) {
  if (!buffer || !report) return { ok: false, skipped: true, reason: 'missing_args' }
  if (report.isSample) return { ok: false, skipped: true, reason: 'sample_data', error: 'Sample data is never uploaded to Drive' }

  const rootId = process.env.GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID
  if (!rootId) return { ok: false, skipped: true, reason: 'env_not_set', error: 'GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID is not set' }
  if (!drive.hasDriveCredentials()) return { ok: false, skipped: true, reason: 'no_credentials', error: 'No Google Drive credentials in the environment' }

  const fileName = salesReportFileName(report)
  try {
    const token = await drive.getAccessToken()
    const file = await putPdf(drive.fetch, token, rootId, fileName, buffer)
    return {
      ok: true,
      fileName,
      folderId: rootId,
      fileId: file.id || null,
      replaced: file.replaced,
      webViewLink: file.id ? `https://drive.google.com/file/d/${file.id}/view` : null,
    }
  } catch (err) {
    return { ok: false, skipped: false, reason: 'drive_upload_failed', fileName, error: err?.message || String(err) }
  }
}
