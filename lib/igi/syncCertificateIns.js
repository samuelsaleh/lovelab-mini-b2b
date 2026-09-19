/**
 * Pull LoveLab Certificate In rows into B2B (ERP → B2B).
 *
 * Default mode is a full reconcile: page every ERP row, upsert, then delete
 * local rows whose erp_in_id no longer exists (so ERP deletes show up here).
 *
 * Matching: description → serial (LGAJ…) → igi_models.serial.
 */

import { fetchCertificateIns } from './lovelabCertificates'
import { serialFromDescription } from './stockLabel'

/** @param {string|null|undefined} ref */
export function isB2bOriginatedIn(ref) {
  if (!ref) return false
  return /^visit:/i.test(String(ref).trim())
}

/**
 * @param {object} db supabase admin
 * @param {{ fetchIns?: Function, limit?: number, full?: boolean }} opts
 */
export async function syncCertificateIns(db, opts = {}) {
  const fetchIns = opts.fetchIns || fetchCertificateIns
  const limit = opts.limit || 500
  const full = opts.full !== false

  if (!full) {
    return syncInsIncremental(db, { fetchIns, limit })
  }

  let afterId = 0
  let fetched = 0
  let matched = 0
  let fromB2b = 0
  const unmatched = []
  const seenIds = []

  while (true) {
    const payload = await fetchIns({ since_id: afterId, limit })
    const rows = payload.data || []
    if (!rows.length) break

    const page = await mapInRows(db, rows, { unmatched })
    matched += page.matched
    fromB2b += page.fromB2b
    fetched += rows.length
    seenIds.push(...rows.map((r) => r.id))

    const { error: upsertErr } = await db
      .from('igi_certificate_in_sync')
      .upsert(page.inserts, { onConflict: 'erp_in_id' })
    if (upsertErr) throw upsertErr

    afterId = Math.max(...rows.map((r) => Number(r.id) || 0), afterId)
    if (rows.length < limit) break
  }

  const deleted = await deleteMissing(db, 'igi_certificate_in_sync', 'erp_in_id', seenIds)

  return {
    mode: 'full',
    since_id: 0,
    next_since_id: afterId,
    fetched,
    inserted: fetched,
    matched,
    from_b2b: fromB2b,
    deleted,
    unmatched: unmatched.slice(0, 20),
  }
}

async function syncInsIncremental(db, { fetchIns, limit }) {
  const { data: lastRow, error: lastErr } = await db
    .from('igi_certificate_in_sync')
    .select('erp_in_id')
    .order('erp_in_id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastErr) throw lastErr

  const sinceId = lastRow?.erp_in_id || 0
  const payload = await fetchIns({ since_id: sinceId, limit })
  const rows = payload.data || []

  if (!rows.length) {
    return {
      mode: 'incremental',
      since_id: sinceId,
      fetched: 0,
      inserted: 0,
      matched: 0,
      from_b2b: 0,
      deleted: 0,
      unmatched: [],
    }
  }

  const unmatched = []
  const page = await mapInRows(db, rows, { unmatched })
  const { error: upsertErr } = await db
    .from('igi_certificate_in_sync')
    .upsert(page.inserts, { onConflict: 'erp_in_id' })
  if (upsertErr) throw upsertErr

  const maxId = Math.max(...rows.map((r) => Number(r.id) || 0), sinceId)

  return {
    mode: 'incremental',
    since_id: sinceId,
    next_since_id: maxId,
    fetched: rows.length,
    inserted: page.inserts.length,
    matched: page.matched,
    from_b2b: page.fromB2b,
    deleted: 0,
    unmatched: unmatched.slice(0, 20),
  }
}

async function mapInRows(db, rows, { unmatched }) {
  const serials = [...new Set(rows.map((r) => serialFromDescription(r.description)).filter(Boolean))]
  let modelsBySerial = new Map()
  if (serials.length) {
    const { data: models, error: modelErr } = await db
      .from('igi_models')
      .select('id, serial, name')
      .in('serial', serials)
    if (modelErr) throw modelErr
    modelsBySerial = new Map((models || []).map((m) => [String(m.serial).toUpperCase(), m]))
  }

  const inserts = []
  let matched = 0
  let fromB2b = 0

  for (const row of rows) {
    if (isB2bOriginatedIn(row.external_ref)) fromB2b += 1

    const serial = serialFromDescription(row.description)
    const model = serial ? modelsBySerial.get(serial) : null
    if (model) matched += 1
    else unmatched.push({ erp_in_id: row.id, description: row.description })

    inserts.push({
      erp_in_id: row.id,
      invoice_no: row.invoice_no != null ? String(row.invoice_no) : null,
      in_date: row.date || null,
      party: row.party || null,
      description: row.description || null,
      pcs: row.pcs != null ? Number(row.pcs) : 0,
      remark: row.remark || null,
      source: row.source || null,
      external_ref: row.external_ref || null,
      model_id: model?.id || null,
      serial: serial || null,
      payload: row,
    })
  }

  return { inserts, matched, fromB2b }
}

/**
 * Remove local sync rows whose ERP id is gone.
 * @param {string[]} remoteIds  all ids currently present in ERP (may be empty)
 */
export async function deleteMissing(db, table, idCol, remoteIds) {
  const { data: local, error } = await db.from(table).select(idCol)
  if (error) throw error

  const remote = new Set((remoteIds || []).map((id) => Number(id)))
  const orphans = (local || [])
    .map((r) => r[idCol])
    .filter((id) => id != null && !remote.has(Number(id)))

  if (!orphans.length) return 0

  // Chunk deletes to stay under PostgREST URL limits
  const chunkSize = 200
  for (let i = 0; i < orphans.length; i += chunkSize) {
    const chunk = orphans.slice(i, i + chunkSize)
    const { error: delErr } = await db.from(table).delete().in(idCol, chunk)
    if (delErr) throw delErr
  }
  return orphans.length
}
