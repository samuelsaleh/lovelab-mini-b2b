/**
 * @jest-environment node
 */
import { createJob, runJob, getJobView, outputName, jobsAreBusy, JOBS_BUCKET } from '../jobs'

const file = { name: 'Catalogue.pdf', path: '/CATALOGUE/Catalogue.pdf' }
const language = { code: 'fr', name: 'French' }

/** A fake Supabase admin client whose storage is a Map of path → Buffer. */
function fakeAdmin({ failUpload = null } = {}) {
  const files = new Map()
  const uploads = []
  const admin = {
    files,
    uploads,
    storage: {
      from: (bucket) => ({
        upload: async (path, body, opts) => {
          uploads.push({ bucket, path, opts })
          if (failUpload && failUpload(path)) return { error: { message: 'no space' } }
          files.set(path, Buffer.from(body))
          return { error: null }
        },
        download: async (path) => {
          if (!files.has(path)) return { data: null, error: { message: 'not found' } }
          return { data: { text: async () => files.get(path).toString() }, error: null }
        },
        createSignedUrl: async (path, secs, opts) => ({ data: { signedUrl: `https://signed/${encodeURIComponent(path)}?d=${opts?.download}` }, error: null }),
      }),
    },
  }
  return admin
}

const statusOf = (admin, id) => JSON.parse(admin.files.get(`translations/${id}/job.json`).toString())

describe('outputName', () => {
  it('appends the language to the original name', () => {
    expect(outputName(file, language)).toBe('Catalogue — French.pdf')
  })
})

describe('createJob', () => {
  it('writes a queued job file with who asked, which file and which language, never cached', async () => {
    const admin = fakeAdmin()
    const id = await createJob(admin, { userId: 'u1', file, language })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(statusOf(admin, id)).toMatchObject({ id, created_by: 'u1', source_path: file.path, language: 'fr', status: 'queued' })
    expect(admin.uploads[0]).toMatchObject({ bucket: JOBS_BUCKET, path: `translations/${id}/job.json`, opts: { upsert: true, cacheControl: '0' } })
  })

  it('fails when the job file cannot be written', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const admin = fakeAdmin({ failUpload: () => true })
    await expect(createJob(admin, { userId: 'u1', file, language })).rejects.toThrow('Could not create the translation job')
  })
})

describe('runJob', () => {
  const job = (id = 'j1') => ({ id, userId: 'u1', file, language })

  it('stores the PDF under a plain ASCII name (an em dash in a storage key is refused) and keeps the display name', async () => {
    const admin = fakeAdmin()
    const translateDocument = async () => ({ ok: true, pdf: Buffer.from('pdf'), flags: [{ kind: 'overflow' }], stats: { pages: 24 } })
    await runJob(admin, job(), { translateDocument })
    expect(admin.files.get('translations/j1/translated.pdf').toString()).toBe('pdf')
    expect(statusOf(admin, 'j1')).toMatchObject({ status: 'done', result_path: 'translations/j1/translated.pdf', filename: 'Catalogue — French.pdf', pages: 24, flags: [{ kind: 'overflow' }], created_by: 'u1' })
  })

  it('records the engine error', async () => {
    const admin = fakeAdmin()
    const translateDocument = async () => ({ ok: false, status: 422, error: 'This PDF has no text to translate' })
    await runJob(admin, job(), { translateDocument })
    expect(statusOf(admin, 'j1')).toMatchObject({ status: 'failed', error: 'This PDF has no text to translate' })
    expect([...admin.files.keys()]).toEqual(['translations/j1/job.json'])
  })

  it('fails the job when the PDF upload fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const admin = fakeAdmin({ failUpload: (p) => p.endsWith('.pdf') })
    const translateDocument = async () => ({ ok: true, pdf: Buffer.from('pdf'), flags: [], stats: { pages: 1 } })
    await runJob(admin, job(), { translateDocument })
    expect(statusOf(admin, 'j1')).toMatchObject({ status: 'failed', error: 'Could not save the translated PDF (no space)' })
  })

  it('never throws when the engine crashes', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const admin = fakeAdmin()
    const translateDocument = async () => { throw new Error('boom') }
    await expect(runJob(admin, job(), { translateDocument })).resolves.toBeUndefined()
    expect(statusOf(admin, 'j1')).toMatchObject({ status: 'failed', error: 'Translation failed' })
  })
})

describe('getJobView', () => {
  const now = Date.parse('2026-10-19T12:00:00Z')
  const put = (admin, state) => admin.files.set(`translations/${state.id}/job.json`, Buffer.from(JSON.stringify(state)))
  const base = { id: 'j', created_by: 'u1', created_at: '2026-10-19T11:59:00Z', updated_at: '2026-10-19T11:59:30Z' }

  it('hides jobs that are not yours or do not exist', async () => {
    const admin = fakeAdmin()
    put(admin, { ...base, status: 'running' })
    expect(await getJobView(admin, 'j', 'other', now)).toBeNull()
    expect(await getJobView(admin, 'nope', 'u1', now)).toBeNull()
  })

  it('reports a running job', async () => {
    const admin = fakeAdmin()
    put(admin, { ...base, status: 'running' })
    expect(await getJobView(admin, 'j', 'u1', now)).toEqual({ id: 'j', status: 'running', error: undefined })
  })

  it('shows a job that stopped reporting as failed', async () => {
    const admin = fakeAdmin()
    put(admin, { ...base, status: 'running', updated_at: '2026-10-19T11:40:00Z' })
    expect((await getJobView(admin, 'j', 'u1', now)).status).toBe('failed')
  })

  it('gives a signed download link and the count of flags that need a look (not shrunk ones) when done', async () => {
    const admin = fakeAdmin()
    put(admin, { ...base, status: 'done', result_path: 'translations/j/translated.pdf', filename: 'Catalogue — French.pdf', flags: [{ kind: 'overflow' }, { kind: 'untranslated' }, { kind: 'shrunk' }, { kind: 'linebreaks' }], pages: 24 })
    expect(await getJobView(admin, 'j', 'u1', now)).toEqual({
      id: 'j',
      status: 'done',
      url: `https://signed/${encodeURIComponent('translations/j/translated.pdf')}?d=Catalogue - French.pdf`,
      filename: 'Catalogue — French.pdf',
      flags: 2,
      pages: 24,
    })
  })

  it('treats an unreadable job file as unknown', async () => {
    const admin = fakeAdmin()
    admin.files.set('translations/j/job.json', Buffer.from('not json'))
    expect(await getJobView(admin, 'j', 'u1', now)).toBeNull()
  })
})

describe('jobsAreBusy', () => {
  it('is true once 3 jobs are in flight and frees a slot when one ends', async () => {
    const admin = fakeAdmin()
    const ids = []
    for (let i = 0; i < 3; i += 1) ids.push(await createJob(admin, { userId: 'u1', file, language }))
    expect(jobsAreBusy()).toBe(true)
    await runJob(admin, { id: ids[0], userId: 'u1', file, language }, { translateDocument: async () => ({ ok: false, error: 'x' }) })
    expect(jobsAreBusy()).toBe(false)
    for (const id of ids.slice(1)) await runJob(admin, { id, userId: 'u1', file, language }, { translateDocument: async () => ({ ok: false, error: 'x' }) })
    expect(jobsAreBusy()).toBe(false)
  })
})
