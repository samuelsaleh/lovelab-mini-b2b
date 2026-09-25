import { DEFAULT_REPORT_EMAIL, emailSalesReport, reportRecipients } from '../emailDelivery.js'

const report = { month: '2026-08', monthLabel: 'August 2026', isSample: false, partial: false }
const email = { subject: 'LoveLab — August 2026 sales', html: '<html>brief</html>' }

describe('reportRecipients', () => {
  it('reads a comma list and drops blanks and non-addresses', () => {
    expect(reportRecipients(' rafi@example.com , ,sam@example.com,nope ')).toEqual(['rafi@example.com', 'sam@example.com'])
    expect(reportRecipients('')).toEqual([])
  })
})

describe('emailSalesReport', () => {
  it('sends the HTML as the body with the PDF attached', async () => {
    const send = jest.fn().mockResolvedValue({ sent: true, message_id: 'm1' })
    const res = await emailSalesReport({ report, email, pdf: Buffer.from('%PDF'), send, recipients: ['rafi@example.com'] })
    expect(send).toHaveBeenCalledWith({
      to: ['rafi@example.com'],
      subject: 'LoveLab — August 2026 sales',
      html: '<html>brief</html>',
      attachments: [{ filename: '2026-08 August — LoveLab sales report.pdf', content: Buffer.from('%PDF') }],
    })
    expect(res).toMatchObject({ sent: true, recipients: 1, attached: true })
  })

  it('sends nothing without recipients, and never sends sample data', async () => {
    const send = jest.fn()
    expect(await emailSalesReport({ report, email, pdf: Buffer.from('x'), send, recipients: [] })).toMatchObject({ skipped: true, reason: 'no_recipients' })
    expect(await emailSalesReport({ report: { ...report, isSample: true }, email, send, recipients: ['rafi@example.com'] })).toMatchObject({ skipped: true, reason: 'sample_data' })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('default recipient (for now)', () => {
  const OLD = process.env.MONTHLY_SALES_REPORT_RECIPIENTS
  afterEach(() => { if (OLD === undefined) delete process.env.MONTHLY_SALES_REPORT_RECIPIENTS; else process.env.MONTHLY_SALES_REPORT_RECIPIENTS = OLD })

  it('goes to Sam when no list is configured, and to nobody when the list is set but empty', () => {
    delete process.env.MONTHLY_SALES_REPORT_RECIPIENTS
    expect(DEFAULT_REPORT_EMAIL).toBe('sam@love-lab.com')
    expect(reportRecipients()).toEqual(['sam@love-lab.com'])
    process.env.MONTHLY_SALES_REPORT_RECIPIENTS = ''
    expect(reportRecipients()).toEqual([])
    process.env.MONTHLY_SALES_REPORT_RECIPIENTS = 'a@b.co, c@d.co'
    expect(reportRecipients()).toEqual(['a@b.co', 'c@d.co'])
  })
})
