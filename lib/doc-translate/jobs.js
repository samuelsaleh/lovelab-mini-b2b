/**
 * Background translation jobs.
 *
 * A translation can take longer than a click should wait and the result (the
 * catalogue is ~9 MB) is bigger than a Vercel response may be (4.5 MB), so the
 * PDF is stored and the browser polls a job. All functions take the Supabase
 * admin client so they can be tested with a fake.
 *
 * Nothing to migrate: everything lives in the private `documents` bucket the
 * app already uses, under translations/<job id>/:
 *   job.json                    status of the job (who asked, queued/running/done/failed, flags)
 *   <name> — <Language>.pdf     the translated PDF, once done
 */
import { randomUUID } from 'node:crypto'
import { translateDocument } from '@/lib/doc-translate/engine'

export const JOBS_BUCKET = 'documents'
const SIGNED_URL_SECONDS = 600
const STALE_AFTER_MS = 6 * 60 * 1000
// Notes for the log that are not something to check: type set a little smaller, line breaks flowed.
const QUIET_FLAGS = new Set(['shrunk', 'linebreaks'])

// Jobs that were accepted and have not finished. The server is small, so at most this many are
// in flight (each holds a PDF in memory and waits on Claude); the PDF work itself is one at a time.
const MAX_ACTIVE_JOBS = 3
let active = 0
export const jobsAreBusy = () => active >= MAX_ACTIVE_JOBS

const jobPath = (id) => `translations/${id}/job.json`

export function outputName(file, language) {
  return `${file.name.replace(/\.pdf$/i, '')} — ${language.name}.pdf`
}

async function writeJob(admin, state) {
  const body = Buffer.from(JSON.stringify({ ...state, updated_at: new Date().toISOString() }))
  // cacheControl 0: the status is read again every 2 s and must never come from a cache
  const { error } = await admin.storage
    .from(JOBS_BUCKET)
    .upload(jobPath(state.id), body, { contentType: 'application/json', upsert: true, cacheControl: '0' })
  if (error) throw new Error(`could not save the job status: ${error.message}`)
}

/** @returns the new job's id */
export async function createJob(admin, { userId, file, language }) {
  const state = {
    id: randomUUID(),
    created_by: userId,
    source_path: file.path,
    language: language.code,
    status: 'queued',
    created_at: new Date().toISOString(),
  }
  try {
    await writeJob(admin, state)
  } catch (err) {
    console.error('[doc-translate]', err.message)
    throw new Error('Could not create the translation job')
  }
  active += 1 // released when runJob ends
  return state.id
}

/** Runs one job to the end. Never throws: the outcome is written to the job file. */
export async function runJob(admin, { id, userId, file, language }, deps = {}) {
  const translate = deps.translateDocument || translateDocument
  const state = { id, created_by: userId, source_path: file.path, language: language.code, status: 'running', created_at: new Date().toISOString() }
  const save = (patch) => writeJob(admin, Object.assign(state, patch)).catch((err) => console.error('[doc-translate]', err.message))
  try {
    await save({})
    const result = await translate({ file, language }, deps)
    if (!result.ok) {
      await save({ status: 'failed', error: result.error || 'Translation failed' })
      return
    }
    const resultPath = `translations/${id}/${outputName(file, language)}`
    const { error } = await admin.storage
      .from(JOBS_BUCKET)
      .upload(resultPath, result.pdf, { contentType: 'application/pdf', upsert: true })
    if (error) {
      console.error('[doc-translate] upload failed:', error.message)
      await save({ status: 'failed', error: 'Could not save the translated PDF' })
      return
    }
    await save({ status: 'done', result_path: resultPath, flags: result.flags, pages: result.stats.pages })
  } catch (err) {
    console.error('[doc-translate] job crashed:', err?.message)
    await save({ status: 'failed', error: 'Translation failed' })
  } finally {
    active = Math.max(0, active - 1)
  }
}

async function readJob(admin, id) {
  const { data, error } = await admin.storage.from(JOBS_BUCKET).download(jobPath(id))
  if (error || !data) return null
  try { return JSON.parse(await data.text()) } catch { return null }
}

/**
 * The job as the browser may see it, or null when it does not exist or is not
 * the caller's. A job that stopped reporting (the function was killed) is
 * shown as failed instead of spinning forever.
 */
export async function getJobView(admin, id, userId, now = Date.now()) {
  const job = await readJob(admin, id)
  if (!job || job.created_by !== userId) return null

  if ((job.status === 'queued' || job.status === 'running') && now - Date.parse(job.updated_at || job.created_at) > STALE_AFTER_MS) {
    return { id: job.id, status: 'failed', error: 'The translation timed out. Please try again.' }
  }
  if (job.status !== 'done') {
    return { id: job.id, status: job.status, error: job.error || undefined }
  }

  const filename = job.result_path.split('/').slice(2).join('/')
  const { data: signed, error } = await admin.storage
    .from(JOBS_BUCKET)
    .createSignedUrl(job.result_path, SIGNED_URL_SECONDS, { download: filename })
  if (error || !signed?.signedUrl) return { id: job.id, status: 'failed', error: 'Could not prepare the download' }
  return {
    id: job.id,
    status: 'done',
    url: signed.signedUrl,
    filename,
    flags: Array.isArray(job.flags) ? job.flags.filter((f) => !QUIET_FLAGS.has(f.kind)).length : 0,
    pages: job.pages,
  }
}
