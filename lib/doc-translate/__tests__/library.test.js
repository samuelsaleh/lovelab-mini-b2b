/**
 * @jest-environment node
 */
import { addToIndex, listTranslations, getTranslatedFile, translationIdFromPath, translationPath, INDEX_PATH, BUCKET } from '../library'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const SRC = '/BRAND PRESENTATION DOCS/LoveLab_Brand_Presentation_General_EN.pdf'

function fakeAdmin(initial = {}) {
  const files = new Map(Object.entries(initial).map(([k, v]) => [k, Buffer.from(typeof v === 'string' ? v : JSON.stringify(v))]))
  return {
    files,
    storage: {
      from: (bucket) => {
        if (bucket !== BUCKET) throw new Error(`unexpected bucket ${bucket}`)
        return {
          upload: async (path, body) => { files.set(path, Buffer.from(body)); return { error: null } },
          download: async (path) => (files.has(path)
            ? { data: { text: async () => files.get(path).toString(), arrayBuffer: async () => files.get(path) }, error: null }
            : { data: null, error: { message: 'not found' } }),
          list: async (prefix) => ({
            data: [...new Set([...files.keys()].filter((k) => k.startsWith(`${prefix}/`)).map((k) => k.split('/')[1]))].map((name) => ({ name, id: null })),
            error: null,
          }),
        }
      },
    },
  }
}

const job = (id, over = {}) => ({
  id, status: 'done', source_path: SRC, language: 'fr', filename: 'LoveLab Brand Presentation — English — French.pdf',
  result_path: `translations/${id}/translated.pdf`, pages: 11, created_at: '2026-10-19T10:00:00Z', updated_at: '2026-10-19T10:01:00Z', ...over,
})

describe('translationIdFromPath', () => {
  it('reads the id from the path the card uses, and nothing else', () => {
    expect(translationIdFromPath(translationPath(A))).toBe(A)
    expect(translationIdFromPath('/api/pack-templates/abc/download')).toBeNull()
    expect(translationIdFromPath('/api/doc-translations/not-a-uuid/file')).toBeNull()
    expect(translationIdFromPath('/api/doc-translations/../file')).toBeNull()
    expect(translationIdFromPath(undefined)).toBeNull()
  })
})

describe('addToIndex / listTranslations', () => {
  it('lists a finished translation with the path the card downloads from', async () => {
    const admin = fakeAdmin()
    await addToIndex(admin, job(A))
    const list = await listTranslations(admin)
    expect(list).toEqual([{
      id: A, name: 'LoveLab Brand Presentation — English — French.pdf', path: `/api/doc-translations/${A}/file`,
      source_path: SRC, language: 'fr', pages: 11, created_at: '2026-10-19T10:01:00Z',
    }])
  })

  it('keeps only the newest translation per document and language', async () => {
    const admin = fakeAdmin()
    await addToIndex(admin, job(A))
    await addToIndex(admin, job(B, { updated_at: '2026-10-19T11:00:00Z' }))
    await addToIndex(admin, job(C, { language: 'nl', filename: 'x — Dutch.pdf', updated_at: '2026-10-19T09:00:00Z' }))
    const list = await listTranslations(admin)
    expect(list.map((e) => e.id)).toEqual([B, C]) // newest first, A replaced by B
  })

  it('does not lose entries when two jobs finish together', async () => {
    const admin = fakeAdmin()
    await Promise.all([addToIndex(admin, job(A)), addToIndex(admin, job(C, { language: 'nl', filename: 'x — Dutch.pdf' }))])
    expect((await listTranslations(admin)).map((e) => e.id).sort()).toEqual([A, C].sort())
  })

  it('rebuilds the index from the finished job files when there is none yet', async () => {
    const admin = fakeAdmin({
      [`translations/${A}/job.json`]: job(A),
      [`translations/${B}/job.json`]: job(B, { status: 'failed', result_path: undefined }),
      [`translations/${C}/job.json`]: job(C, { language: 'nl', filename: 'x — Dutch.pdf' }),
    })
    const list = await listTranslations(admin)
    expect(list.map((e) => e.id).sort()).toEqual([A, C].sort())
    expect(admin.files.has(INDEX_PATH)).toBe(true)
  })

  it('is empty when nothing was translated yet', async () => {
    expect(await listTranslations(fakeAdmin())).toEqual([])
  })
})

describe('getTranslatedFile', () => {
  it('returns the bytes and the display name of a finished translation', async () => {
    const admin = fakeAdmin({ [`translations/${A}/job.json`]: job(A), [`translations/${A}/translated.pdf`]: '%PDF-fake' })
    const f = await getTranslatedFile(admin, A)
    expect(f.fileName).toBe('LoveLab Brand Presentation — English — French.pdf')
    expect(f.buffer.toString()).toBe('%PDF-fake')
  })

  it('returns null for an unknown id, a malformed id, a job that is not done, or a missing PDF', async () => {
    const admin = fakeAdmin({
      [`translations/${A}/job.json`]: job(A, { status: 'running' }),
      [`translations/${B}/job.json`]: job(B),
    })
    expect(await getTranslatedFile(admin, C)).toBeNull()
    expect(await getTranslatedFile(admin, '../../etc/passwd')).toBeNull()
    expect(await getTranslatedFile(admin, A)).toBeNull()
    expect(await getTranslatedFile(admin, B)).toBeNull() // job.json there, translated.pdf missing
  })
})
