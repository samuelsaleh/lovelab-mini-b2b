import { salesReportFileName, uploadSalesReportToDrive } from '../drive.js'
import { generateMonthlySalesReport, previousMonth } from '../run.js'
import { loadSample } from '../dataSources/sample.js'

const report = (over = {}) => ({ month: '2026-08', monthLabel: 'August 2026', isSample: false, partial: false, dataThrough: '2026-09-25', ...over })

/**
 * A fake Drive API over fetch. `state.items` holds what is "in Drive"; every
 * request is recorded so tests can assert nothing is ever deleted.
 */
function fakeDrive({ creds = true, items = [], failOn = null } = {}) {
  const state = { items: [...items], calls: [], nextId: 1 }
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) })
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET'
    state.calls.push({ method, url })
    if (failOn && method === failOn) return json(500, { error: 'quota exceeded' })
    if (method === 'GET') {
      const q = decodeURIComponent(new URL(url).searchParams.get('q'))
      const name = q.match(/name = '((?:[^'\\]|\\.)*)'/)[1].replace(/\\'/g, "'")
      const parent = q.match(/'([^']+)' in parents/)[1]
      const folder = q.includes("mimeType = 'application/vnd.google-apps.folder'")
      const files = state.items
        .filter((i) => i.name === name && i.parent === parent && (!folder || i.folder))
        .sort((a, b) => a.createdTime.localeCompare(b.createdTime))
      return json(200, { files })
    }
    if (method === 'POST' && !url.includes('/upload/')) {
      const meta = JSON.parse(init.body)
      const id = `folder-${state.nextId++}`
      state.items.push({ id, name: meta.name, parent: meta.parents[0], folder: true, createdTime: '2026-10-01' })
      return json(200, { id })
    }
    if (method === 'POST') {
      const meta = JSON.parse(String(init.body).split('\r\n\r\n')[1].split('\r\n')[0])
      const id = `file-${state.nextId++}`
      state.items.push({ id, name: meta.name, parent: meta.parents[0], createdTime: '2026-10-01' })
      return json(200, { id })
    }
    if (method === 'PATCH') return json(200, { id: decodeURIComponent(url.split('/files/')[1].split('?')[0]) })
    return json(400, { error: `unexpected ${method}` })
  }
  return { state, drive: { hasDriveCredentials: () => creds, getAccessToken: async () => 'token', fetch } }
}

describe('uploadSalesReportToDrive', () => {
  const OLD = process.env.GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID
  beforeEach(() => { process.env.GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID = 'root-id' })
  afterAll(() => { if (OLD === undefined) delete process.env.GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID; else process.env.GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID = OLD })

  it('uploads the PDF straight into the Monthly Report folder, with Shared-drive support on every call', async () => {
    const { state, drive } = fakeDrive()
    const res = await uploadSalesReportToDrive({ buffer: Buffer.from('%PDF'), report: report(), drive })
    expect(res).toMatchObject({ ok: true, replaced: false, folderId: 'root-id', fileName: '2026-08 August — LoveLab sales report.pdf' })
    expect(res.webViewLink).toBe(`https://drive.google.com/file/d/${res.fileId}/view`)
    expect(state.items).toEqual([expect.objectContaining({ name: '2026-08 August — LoveLab sales report.pdf', parent: 'root-id' })])
    expect(state.items.some((i) => i.folder)).toBe(false) // no subfolders created
    expect(state.calls.every((c) => c.url.includes('supportsAllDrives=true'))).toBe(true)
  })

  it('a re-run replaces the existing PDF instead of adding a duplicate, and deletes nothing', async () => {
    const { state, drive } = fakeDrive({ items: [
      { id: 'aug-pdf', name: '2026-08 August — LoveLab sales report.pdf', parent: 'root-id', createdTime: '2026-09-01' },
    ] })
    const res = await uploadSalesReportToDrive({ buffer: Buffer.from('%PDF-v2'), report: report(), drive })
    expect(res).toMatchObject({ ok: true, replaced: true, fileId: 'aug-pdf' })
    expect(state.items).toHaveLength(1)
    expect(state.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
    expect(state.calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('never uploads sample data', async () => {
    const { state, drive } = fakeDrive()
    expect(await uploadSalesReportToDrive({ buffer: Buffer.from('%PDF'), report: report({ isSample: true }), drive })).toMatchObject({ ok: false, skipped: true, reason: 'sample_data' })
    expect(state.calls).toEqual([])
  })

  it('skips cleanly without a folder id or credentials, and reports a failed upload', async () => {
    delete process.env.GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID
    expect(await uploadSalesReportToDrive({ buffer: Buffer.from('x'), report: report(), drive: fakeDrive().drive })).toMatchObject({ skipped: true, reason: 'env_not_set' })
    process.env.GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID = 'root-id'
    expect(await uploadSalesReportToDrive({ buffer: Buffer.from('x'), report: report(), drive: fakeDrive({ creds: false }).drive })).toMatchObject({ skipped: true, reason: 'no_credentials' })
    const failed = await uploadSalesReportToDrive({ buffer: Buffer.from('x'), report: report(), drive: fakeDrive({ failOn: 'POST' }).drive })
    expect(failed).toMatchObject({ ok: false, reason: 'drive_upload_failed' })
    expect(failed.error).toMatch(/quota exceeded/)
  })
})

describe('run', () => {
  it('previousMonth is the last complete month in Antwerp time', () => {
    expect(previousMonth(new Date('2026-10-01T08:00:00Z'))).toBe('2026-09')
    // 23:30 UTC on 30 Sept is already 1 October in Antwerp.
    expect(previousMonth(new Date('2026-09-30T23:30:00Z'))).toBe('2026-09')
    expect(previousMonth(new Date('2026-01-15T12:00:00Z'))).toBe('2025-12')
  })

  it('builds the report, email and PDF together, and reports a PDF failure instead of throwing', async () => {
    const ok = await generateMonthlySalesReport({ model: loadSample(), month: '2026-08', toPdf: async () => Buffer.from('%PDF') })
    expect(ok.report.month).toBe('2026-08')
    expect(ok.email.subject).toMatch(/August 2026/)
    expect(ok.pdf.toString()).toBe('%PDF')
    const bad = await generateMonthlySalesReport({ model: loadSample(), month: '2026-08', toPdf: async () => { throw new Error('No Chrome') } })
    expect(bad.pdf).toBeNull()
    expect(bad.pdfError).toBe('No Chrome')
  })
})
