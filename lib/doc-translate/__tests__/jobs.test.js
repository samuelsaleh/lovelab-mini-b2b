import { createJob, runJob, getJobView, outputName, JOBS_BUCKET } from '../jobs'

const file = { name: 'Catalogue.pdf', path: '/CATALOGUE/Catalogue.pdf' }
const language = { code: 'fr', name: 'French' }

function fakeAdmin({ rows = {}, uploadError = null, signed = { signedUrl: 'https://signed/x' } } = {}) {
  const calls = { updates: [], uploads: [], inserts: [] }
  const admin = {
    calls,
    from: () => ({
      insert: (row) => {
        calls.inserts.push(row)
        return { select: () => ({ single: async () => ({ data: { id: 'job1' }, error: null }) }) }
      },
      update: (patch) => {
        calls.updates.push(patch)
        return { eq: async () => ({ error: null }) }
      },
      select: () => ({ eq: (_c, id) => ({ maybeSingle: async () => ({ data: rows[id] || null }) }) }),
    }),
    storage: {
      from: (bucket) => ({
        upload: async (path, body, opts) => {
          calls.uploads.push({ bucket, path, opts })
          return { error: uploadError }
        },
        createSignedUrl: async (path, secs, opts) => ({ data: signed, error: null, path, opts }),
      }),
    },
  }
  return admin
}

describe('outputName', () => {
  it('appends the language to the original name', () => {
    expect(outputName(file, language)).toBe('Catalogue — French.pdf')
  })
})

describe('createJob', () => {
  it('stores who asked, which file and which language', async () => {
    const admin = fakeAdmin()
    const id = await createJob(admin, { userId: 'u1', file, language })
    expect(id).toBe('job1')
    expect(admin.calls.inserts[0]).toEqual({ created_by: 'u1', source_path: file.path, language: 'fr', status: 'queued' })
  })
})

describe('runJob', () => {
  it('uploads the PDF and marks the job done with the flags', async () => {
    const admin = fakeAdmin()
    const translateDocument = async () => ({ ok: true, pdf: Buffer.from('pdf'), flags: [{ page: 1 }], stats: { pages: 24 } })
    await runJob(admin, { id: 'job1', file, language }, { translateDocument })
    expect(admin.calls.uploads[0]).toMatchObject({ bucket: JOBS_BUCKET, path: 'job1/Catalogue — French.pdf' })
    const last = admin.calls.updates.at(-1)
    expect(last).toMatchObject({ status: 'done', result_path: 'job1/Catalogue — French.pdf', pages: 24, flags: [{ page: 1 }] })
  })

  it('records the engine error', async () => {
    const admin = fakeAdmin()
    const translateDocument = async () => ({ ok: false, status: 422, error: 'This PDF has no text to translate' })
    await runJob(admin, { id: 'job1', file, language }, { translateDocument })
    expect(admin.calls.updates.at(-1)).toMatchObject({ status: 'failed', error: 'This PDF has no text to translate' })
    expect(admin.calls.uploads).toHaveLength(0)
  })

  it('fails the job when the upload fails', async () => {
    const admin = fakeAdmin({ uploadError: { message: 'no bucket' } })
    const translateDocument = async () => ({ ok: true, pdf: Buffer.from('pdf'), flags: [], stats: { pages: 1 } })
    await runJob(admin, { id: 'job1', file, language }, { translateDocument })
    expect(admin.calls.updates.at(-1)).toMatchObject({ status: 'failed', error: 'Could not save the translated PDF' })
  })

  it('never throws when the engine crashes', async () => {
    const admin = fakeAdmin()
    const translateDocument = async () => { throw new Error('boom') }
    await expect(runJob(admin, { id: 'job1', file, language }, { translateDocument })).resolves.toBeUndefined()
    expect(admin.calls.updates.at(-1)).toMatchObject({ status: 'failed', error: 'Translation failed' })
  })
})

describe('getJobView', () => {
  const now = Date.parse('2026-10-19T12:00:00Z')
  const base = { id: 'j', created_by: 'u1', created_at: '2026-10-19T11:59:00Z', updated_at: '2026-10-19T11:59:30Z' }

  it('hides jobs that are not yours or do not exist', async () => {
    const admin = fakeAdmin({ rows: { j: { ...base, status: 'running' } } })
    expect(await getJobView(admin, 'j', 'other', now)).toBeNull()
    expect(await getJobView(admin, 'nope', 'u1', now)).toBeNull()
  })

  it('reports a running job', async () => {
    const admin = fakeAdmin({ rows: { j: { ...base, status: 'running' } } })
    expect(await getJobView(admin, 'j', 'u1', now)).toEqual({ id: 'j', status: 'running', error: undefined })
  })

  it('shows a job that stopped reporting as failed', async () => {
    const admin = fakeAdmin({ rows: { j: { ...base, status: 'running', updated_at: '2026-10-19T11:40:00Z' } } })
    const view = await getJobView(admin, 'j', 'u1', now)
    expect(view.status).toBe('failed')
  })

  it('gives a signed download link and the flag count when done', async () => {
    const admin = fakeAdmin({ rows: { j: { ...base, status: 'done', result_path: 'j/Catalogue — French.pdf', flags: [{}, {}], pages: 24 } } })
    expect(await getJobView(admin, 'j', 'u1', now)).toEqual({
      id: 'j', status: 'done', url: 'https://signed/x', filename: 'Catalogue — French.pdf', flags: 2, pages: 24,
    })
  })
})
