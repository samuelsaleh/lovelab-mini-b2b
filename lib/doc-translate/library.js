/**
 * The library of translated documents: what the Resources card lists next to the
 * original files, downloads, and attaches to emails.
 *
 * Same storage as the jobs (private `documents` bucket, translations/):
 *   translations/index.json      latest translation of each document and language
 *   translations/<id>/job.json   one job (see jobs.js)
 *   translations/<id>/translated.pdf
 * Only the newest translation per (document, language) is listed; older ones stay in storage.
 * If index.json does not exist yet (jobs from before the library), it is rebuilt from the job files.
 */

export const BUCKET = 'documents'
export const INDEX_PATH = 'translations/index.json'
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The path the card and the email route use for a translated file (served by /api/doc-translations/[id]/file). */
export const translationPath = (id) => `/api/doc-translations/${id}/file`

const PATH_RE = /^\/api\/doc-translations\/([0-9a-f-]{36})\/file$/i
export function translationIdFromPath(path) {
  const m = PATH_RE.exec(String(path || ''))
  return m && UUID_RE.test(m[1]) ? m[1] : null
}

async function readJson(admin, path) {
  const { data, error } = await admin.storage.from(BUCKET).download(path)
  if (error || !data) return null
  try { return JSON.parse(await data.text()) } catch { return null }
}

async function writeJson(admin, path, value) {
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(JSON.stringify(value)), { contentType: 'application/json', upsert: true, cacheControl: '0' })
  if (error) throw new Error(`could not write ${path}: ${error.message}`)
}

const keyOf = (e) => `${e.source_path}|${e.language}`
const newestFirst = (a, b) => String(b.created_at).localeCompare(String(a.created_at))

function dedupe(entries) {
  const best = new Map()
  for (const e of [...entries].sort(newestFirst)) if (!best.has(keyOf(e))) best.set(keyOf(e), e)
  return [...best.values()].sort(newestFirst)
}

const entryOf = (job) => ({
  id: job.id,
  source_path: job.source_path,
  language: job.language,
  filename: job.filename,
  pages: job.pages ?? null,
  created_at: job.updated_at || job.created_at,
})

/** Builds the index from the job files of every finished translation. */
async function rebuildIndex(admin) {
  const { data: folders, error } = await admin.storage.from(BUCKET).list('translations', { limit: 500 })
  if (error || !Array.isArray(folders)) return { items: [] }
  const ids = folders.map((f) => f.name).filter((n) => UUID_RE.test(n))
  const found = []
  for (let i = 0; i < ids.length; i += 6) {
    const jobs = await Promise.all(ids.slice(i, i + 6).map((id) => readJson(admin, `translations/${id}/job.json`)))
    for (const job of jobs) if (job?.status === 'done' && job.result_path && job.filename && job.source_path) found.push(entryOf(job))
  }
  return { items: dedupe(found) }
}

// One writer at a time inside this process, so two jobs finishing together cannot overwrite each other's entry.
let chain = Promise.resolve()

export function addToIndex(admin, job) {
  const run = chain.then(async () => {
    const index = (await readJson(admin, INDEX_PATH)) || (await rebuildIndex(admin))
    index.items = dedupe([...(index.items || []), entryOf(job)])
    await writeJson(admin, INDEX_PATH, index)
  })
  chain = run.catch(() => {})
  return run
}

/** @returns {Promise<Array<{id, name, path, source_path, language, pages, created_at}>>} newest first */
export async function listTranslations(admin) {
  let index = await readJson(admin, INDEX_PATH)
  if (!index) {
    index = await rebuildIndex(admin)
    await writeJson(admin, INDEX_PATH, index).catch(() => {}) // the next call rebuilds again; not fatal
  }
  return dedupe(index.items || []).map((e) => ({
    id: e.id,
    name: e.filename,
    path: translationPath(e.id),
    source_path: e.source_path,
    language: e.language,
    pages: e.pages,
    created_at: e.created_at,
  }))
}

/** The bytes and display name of a finished translation, or null. */
export async function getTranslatedFile(admin, id) {
  if (!UUID_RE.test(String(id || ''))) return null
  const job = await readJson(admin, `translations/${id}/job.json`)
  if (!job || job.status !== 'done' || !job.result_path) return null
  const { data, error } = await admin.storage.from(BUCKET).download(job.result_path)
  if (error || !data) return null
  return { buffer: Buffer.from(await data.arrayBuffer()), fileName: job.filename || 'translated.pdf', job }
}
