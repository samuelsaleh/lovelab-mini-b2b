/**
 * Background translation jobs.
 *
 * A translation can take longer than a click should wait and the result (the
 * catalogue is ~9 MB) is bigger than a Vercel response may be (4.5 MB), so the
 * PDF is stored and the browser polls a job. All functions take the Supabase
 * admin client so they can be tested with a fake.
 *
 * Table: translation_jobs (see supabase/migrations/…_translation_jobs.sql).
 * Bucket: translated-documents (private).
 */
import { translateDocument } from '@/lib/doc-translate/engine'

export const JOBS_TABLE = 'translation_jobs'
export const JOBS_BUCKET = 'translated-documents'
const SIGNED_URL_SECONDS = 600
const STALE_AFTER_MS = 6 * 60 * 1000

export function outputName(file, language) {
  return `${file.name.replace(/\.pdf$/i, '')} — ${language.name}.pdf`
}

export async function createJob(admin, { userId, file, language }) {
  const { data, error } = await admin
    .from(JOBS_TABLE)
    .insert({ created_by: userId, source_path: file.path, language: language.code, status: 'queued' })
    .select('id')
    .single()
  if (error || !data) throw new Error('Could not create the translation job')
  return data.id
}

async function patchJob(admin, id, patch) {
  const { error } = await admin.from(JOBS_TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) console.error('[doc-translate] job update failed:', error.message)
}

/** Runs one job to the end. Never throws: the outcome is written to the row. */
export async function runJob(admin, { id, file, language }, deps = {}) {
  const translate = deps.translateDocument || translateDocument
  try {
    await patchJob(admin, id, { status: 'running' })
    const result = await translate({ file, language }, deps)
    if (!result.ok) {
      await patchJob(admin, id, { status: 'failed', error: result.error || 'Translation failed' })
      return
    }
    const resultPath = `${id}/${outputName(file, language)}`
    const { error } = await admin.storage
      .from(JOBS_BUCKET)
      .upload(resultPath, result.pdf, { contentType: 'application/pdf', upsert: true })
    if (error) {
      console.error('[doc-translate] upload failed:', error.message)
      await patchJob(admin, id, { status: 'failed', error: 'Could not save the translated PDF' })
      return
    }
    await patchJob(admin, id, {
      status: 'done',
      result_path: resultPath,
      flags: result.flags,
      pages: result.stats.pages,
    })
  } catch (err) {
    console.error('[doc-translate] job crashed:', err?.message)
    await patchJob(admin, id, { status: 'failed', error: 'Translation failed' })
  }
}

/**
 * The job as the browser may see it, or null when it does not exist or is not
 * the caller's. A job that stopped reporting (the function was killed) is
 * shown as failed instead of spinning forever.
 */
export async function getJobView(admin, id, userId, now = Date.now()) {
  const { data: job } = await admin.from(JOBS_TABLE).select('*').eq('id', id).maybeSingle()
  if (!job || job.created_by !== userId) return null

  if ((job.status === 'queued' || job.status === 'running') && now - Date.parse(job.updated_at || job.created_at) > STALE_AFTER_MS) {
    return { id: job.id, status: 'failed', error: 'The translation timed out. Please try again.' }
  }
  if (job.status !== 'done') {
    return { id: job.id, status: job.status, error: job.error || undefined }
  }

  const filename = job.result_path.split('/').slice(1).join('/')
  const { data: signed, error } = await admin.storage
    .from(JOBS_BUCKET)
    .createSignedUrl(job.result_path, SIGNED_URL_SECONDS, { download: filename })
  if (error || !signed?.signedUrl) return { id: job.id, status: 'failed', error: 'Could not prepare the download' }
  return {
    id: job.id,
    status: 'done',
    url: signed.signedUrl,
    filename,
    flags: Array.isArray(job.flags) ? job.flags.filter((f) => f.kind !== 'shrunk').length : 0,
    pages: job.pages,
  }
}
