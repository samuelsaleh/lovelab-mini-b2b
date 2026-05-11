/**
 * @jest-environment node
 *
 * GET /api/backup — admin alert routing.
 *
 * Pre-fix bug: the route did `to: [ADMIN_NOTIFICATION_EMAIL || sender]`,
 * which passed a comma-separated string straight to Resend. Resend rejected
 * it (the string isn't a valid email), so multi-recipient backup-failure
 * alerts went silently undelivered.
 *
 * Post-fix: parse the env via getAdminNotificationRecipients (shared helper
 * in lib/email.js) and split into to + cc.
 */

const mockCreateDailyBackupFolder = jest.fn()
const mockUploadJsonToDrive = jest.fn()
const mockUploadFileToDrive = jest.fn()

jest.mock('@/lib/google-drive', () => ({
  createDailyBackupFolder: (...args) => mockCreateDailyBackupFolder(...args),
  uploadJsonToDrive: (...args) => mockUploadJsonToDrive(...args),
  uploadFileToDrive: (...args) => mockUploadFileToDrive(...args),
}))

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(() => ({
    from: () => ({ select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    storage: { from: () => ({ list: () => Promise.resolve({ data: [], error: null }) }) },
  })),
}))

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))

let capturedFetchBodies = []
const originalFetch = global.fetch

function makeCronRequest() {
  return new Request('http://localhost:3000/api/backup', {
    method: 'GET',
    headers: { 'x-vercel-cron-secret': 'secret_test' },
  })
}

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  capturedFetchBodies = []
  process.env.RESEND_API_KEY = 'test_key'
  process.env.SENDER_EMAIL = 'alberto@love-lab.com'
  process.env.CRON_SECRET = 'secret_test'
  delete process.env.ADMIN_NOTIFICATION_EMAIL

  // Force the GET handler into the catch branch so sendAlertEmail fires
  // every time. Anything throwing inside the try block reaches the alert
  // path — createDailyBackupFolder is the first external call so it's
  // the cleanest place to inject a failure.
  mockCreateDailyBackupFolder.mockRejectedValue(new Error('drive offline'))

  global.fetch = jest.fn(async (url, init) => {
    if (typeof url === 'string' && url.includes('api.resend.com')) {
      capturedFetchBodies.push(JSON.parse(init.body))
      return { ok: true, status: 200, text: async () => '' }
    }
    return originalFetch(url, init)
  })
})

afterAll(() => {
  global.fetch = originalFetch
})

async function callBackup() {
  const { GET } = require('../backup/route')
  return GET(makeCronRequest())
}

describe('GET /api/backup — admin alert recipient parsing', () => {
  it('splits ADMIN_NOTIFICATION_EMAIL into to + cc (the original bug)', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'albertosaleh@gmail.com,samuelsaleh@gmail.com'
    await callBackup()
    expect(capturedFetchBodies.length).toBe(1)
    const body = capturedFetchBodies[0]
    // Pre-fix this would have been ['albertosaleh@gmail.com,samuelsaleh@gmail.com']
    expect(body.to).toEqual(['albertosaleh@gmail.com'])
    expect(body.cc).toEqual(['samuelsaleh@gmail.com'])
  })

  it('handles single-recipient env var without a cc field', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'solo@example.com'
    await callBackup()
    const body = capturedFetchBodies[0]
    expect(body.to).toEqual(['solo@example.com'])
    expect(body.cc).toBeUndefined()
  })

  it('falls back to the default admin when env is unset', async () => {
    delete process.env.ADMIN_NOTIFICATION_EMAIL
    await callBackup()
    const body = capturedFetchBodies[0]
    expect(body.to).toEqual(['albertosaleh@gmail.com'])
    expect(body.cc).toBeUndefined()
  })

  it('lowercases + dedupes case-insensitive duplicates', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'A@x.com, a@X.COM, b@x.com'
    await callBackup()
    const body = capturedFetchBodies[0]
    expect(body.to).toEqual(['a@x.com'])
    expect(body.cc).toEqual(['b@x.com'])
  })
})
