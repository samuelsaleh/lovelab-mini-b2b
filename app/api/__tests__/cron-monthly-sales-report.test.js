/**
 * @jest-environment node
 *
 * /api/cron/monthly-sales-report GET.
 *
 * Covers:
 *   - Rejects without a matching CRON_SECRET header
 *   - Rejects a malformed ?month
 *   - Builds last month by default, or the requested month, and uploads to Drive
 *   - 500 when the PDF cannot be made (nothing uploaded)
 */

const loadFromSupabase = jest.fn()
const generateMonthlySalesReport = jest.fn()
const uploadSalesReportToDrive = jest.fn()
const emailSalesReport = jest.fn()
const checkReport = jest.fn()
const sendReportAlert = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createAdminClient: jest.fn(() => ({})) }))
jest.mock('@/lib/monthlySalesReport/dataSources/supabase', () => ({ loadFromSupabase: (...a) => loadFromSupabase(...a) }))
jest.mock('@/lib/monthlySalesReport/run', () => ({
  generateMonthlySalesReport: (...a) => generateMonthlySalesReport(...a),
  previousMonth: () => '2026-09',
}))
jest.mock('@/lib/monthlySalesReport/drive', () => ({ uploadSalesReportToDrive: (...a) => uploadSalesReportToDrive(...a) }))
jest.mock('@/lib/monthlySalesReport/emailDelivery', () => ({ emailSalesReport: (...a) => emailSalesReport(...a) }))
jest.mock('@/lib/monthlySalesReport/checks', () => ({ checkReport: (...a) => checkReport(...a) }))
jest.mock('@/lib/monthlySalesReport/alerts', () => ({ sendReportAlert: (...a) => sendReportAlert(...a) }))
jest.mock('@/lib/send-email', () => ({ sendEmail: jest.fn() }))

const { GET } = require('../cron/monthly-sales-report/route')

const req = (qs = '', headers = { 'x-vercel-cron-secret': 's3cret' }) => new global.Request(`http://localhost/api/cron/monthly-sales-report${qs}`, { headers })
const built = { report: { kpis: { sales: 81023.1, orders: 66 }, partial: false }, email: { subject: 's', html: '<p>' }, pdf: Buffer.from('%PDF'), pdfError: null }

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret'
  loadFromSupabase.mockReset().mockResolvedValue({ orders: [] })
  generateMonthlySalesReport.mockReset().mockResolvedValue(built)
  uploadSalesReportToDrive.mockReset().mockResolvedValue({ ok: true, webViewLink: 'https://drive.google.com/file/d/x/view' })
  emailSalesReport.mockReset().mockResolvedValue({ sent: true, recipients: 1, attached: true })
  checkReport.mockReset().mockReturnValue({ errors: [], warnings: [] })
  sendReportAlert.mockReset().mockResolvedValue({ sent: true })
})

describe('/api/cron/monthly-sales-report GET', () => {
  test('401 without CRON_SECRET or with the wrong header', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(req())).status).toBe(401)
    process.env.CRON_SECRET = 's3cret'
    expect((await GET(req('', { 'x-vercel-cron-secret': 'nope' }))).status).toBe(401)
    expect(loadFromSupabase).not.toHaveBeenCalled()
  })

  test('400 on a malformed or impossible month', async () => {
    for (const m of ['2026-9', '2026-13', '2026-00', 'august']) expect((await GET(req(`?month=${m}`))).status).toBe(400)
    expect(loadFromSupabase).not.toHaveBeenCalled()
  })

  test('401 on a header of a different length (timing-safe compare)', async () => {
    expect((await GET(req('', { 'x-vercel-cron-secret': 's3cret-and-more' }))).status).toBe(401)
  })

  test('builds last month by default and puts it in Drive', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(generateMonthlySalesReport.mock.calls[0][0].month).toBe('2026-09')
    expect(uploadSalesReportToDrive).toHaveBeenCalledWith({ buffer: built.pdf, report: built.report })
    expect(emailSalesReport).toHaveBeenCalledWith(expect.objectContaining({ report: built.report, email: built.email, pdf: built.pdf }))
    expect(await res.json()).toMatchObject({ month: '2026-09', sales: 81023.1, orders: 66, drive: { ok: true }, email: { sent: true, attached: true } })
  })

  test('honours ?month', async () => {
    await GET(req('?month=2026-08'))
    expect(generateMonthlySalesReport.mock.calls[0][0].month).toBe('2026-08')
  })

  test('500 and no upload when the PDF fails', async () => {
    generateMonthlySalesReport.mockResolvedValue({ ...built, pdf: null, pdfError: 'font failed' })
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(uploadSalesReportToDrive).not.toHaveBeenCalled()
    expect(emailSalesReport).not.toHaveBeenCalled()
    expect(sendReportAlert).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' }))
  })

  test('database unreadable → alert, 500, nothing delivered', async () => {
    loadFromSupabase.mockRejectedValue(new Error('column documents.total_amount does not exist'))
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(sendReportAlert.mock.calls[0][0]).toMatchObject({ level: 'error' })
    expect(sendReportAlert.mock.calls[0][0].problems[0]).toMatch(/Could not read the database.*total_amount does not exist/)
    expect(uploadSalesReportToDrive).not.toHaveBeenCalled()
    expect(emailSalesReport).not.toHaveBeenCalled()
  })

  test('a report that fails its own checks is NOT delivered, and Rafi is alerted', async () => {
    checkReport.mockReturnValue({ errors: ['B2B + B2C does not equal net sales'], warnings: [] })
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(uploadSalesReportToDrive).not.toHaveBeenCalled()
    expect(emailSalesReport).not.toHaveBeenCalled()
    expect(sendReportAlert.mock.calls[0][0].problems).toContain('B2B + B2C does not equal net sales')
  })

  test('data warnings: delivered anyway, Rafi gets a warning alert', async () => {
    checkReport.mockReturnValue({ errors: [], warnings: ['1 order(s) recorded at €0'] })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(uploadSalesReportToDrive).toHaveBeenCalled()
    expect(sendReportAlert).toHaveBeenCalledWith(expect.objectContaining({ level: 'warning', problems: ['1 order(s) recorded at €0'] }))
  })

  test('clean run: no alert at all', async () => {
    await GET(req())
    expect(sendReportAlert).not.toHaveBeenCalled()
  })

  test('a Drive failure does not stop the email, and alerts Rafi', async () => {
    uploadSalesReportToDrive.mockResolvedValue({ ok: false, reason: 'drive_upload_failed', error: 'quota' })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(emailSalesReport).toHaveBeenCalled()
    expect(sendReportAlert).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', delivered: { drive: false, email: true } }))
  })
})
