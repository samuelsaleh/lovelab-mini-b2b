/**
 * Pull LoveLab Certificate Out rows into B2B so ERP outs are mirrored locally.
 *
 * Default mode is a full reconcile: page every ERP row, upsert, then delete
 * local rows whose erp_out_id no longer exists (so ERP deletes show up here).
 *
 * Matching: description → serial (LGAJ…) → igi_models.serial.
 */

import { fetchCertificateOuts } from './lovelabCertificates'
import { serialFromDescription } from './stockLabel'
import { deleteMissing } from './syncCertificateIns'

/**
 * @param {object} db supabase admin
 * @param {{ fetchOuts?: Function, limit?: number, full?: boolean }} opts
 */
export async function syncCertificateOuts(db, opts = {}) {
  const fetchOuts = opts.fetchOuts || fetchCertificateOuts
  const limit = opts.limit || 500
  const full = opts.full !== false

  if (!full) {
    return syncOutsIncremental(db, { fetchOuts, limit })
  }

  let afterId = 0
  let fetched = 0
  let matched = 0
  const unmatched = []
  const seenIds = []

  while (true) {
    const payload = await fetchOuts({ since_id: afterId, limit })
    const rows = payload.data || []
    if (!rows.length) break

    const page = await mapOutRows(db, rows, { unmatched })
    matched += page.matched
    fetched += rows.length
    seenIds.push(...rows.map((r) => r.id))

    const { error: upsertErr } = await db
      .from('igi_certificate_out_sync')
      .upsert(page.inserts, { onConflict: 'erp_out_id' })
    if (upsertErr) throw upsertErr

    afterId = Math.max(...rows.map((r) => Number(r.id) || 0), afterId)
    if (rows.length < limit) break
  }

  const deleted = await deleteMissing(db, 'igi_certificate_out_sync', 'erp_out_id', seenIds)

  return {
    mode: 'full',
    since_id: 0,
    next_since_id: afterId,
    fetched,
    inserted: fetched,
    matched,
    deleted,
    unmatched: unmatched.slice(0, 20),
  }
}

async function syncOutsIncremental(db, { fetchOuts, limit }) {
  const { data: lastRow, error: lastErr } = await db
    .from('igi_certificate_out_sync')
    .select('erp_out_id')
    .order('erp_out_id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastErr) throw lastErr

  const sinceId = lastRow?.erp_out_id || 0
  const payload = await fetchOuts({ since_id: sinceId, limit })
  const rows = payload.data || []

  if (!rows.length) {
    return {
      mode: 'incremental',
      since_id: sinceId,
      fetched: 0,
      inserted: 0,
      matched: 0,
      deleted: 0,
      unmatched: [],
    }
  }

  const unmatched = []
  const page = await mapOutRows(db, rows, { unmatched })
  const { error: upsertErr } = await db
    .from('igi_certificate_out_sync')
    .upsert(page.inserts, { onConflict: 'erp_out_id' })
  if (upsertErr) throw upsertErr

  const maxId = Math.max(...rows.map((r) => Number(r.id) || 0), sinceId)

  return {
    mode: 'incremental',
    since_id: sinceId,
    next_since_id: maxId,
    fetched: rows.length,
    inserted: page.inserts.length,
    matched: page.matched,
    deleted: 0,
    unmatched: unmatched.slice(0, 20),
  }
}

async function mapOutRows(db, rows, { unmatched }) {
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

  for (const row of rows) {
    const serial = serialFromDescription(row.description)
    const model = serial ? modelsBySerial.get(serial) : null
    if (model) matched += 1
    else unmatched.push({ erp_out_id: row.id, description: row.description })

    inserts.push({
      erp_out_id: row.id,
      invoice_no: row.invoice_no != null ? String(row.invoice_no) : null,
      out_date: row.date || null,
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

  return { inserts, matched }
}
