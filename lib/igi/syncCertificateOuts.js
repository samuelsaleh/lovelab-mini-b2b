/**
 * Pull LoveLab Certificate Out rows into B2B so ERP outs are mirrored locally.
 *
 * Matching: description → serial (LGAJ…) → igi_models.serial.
 * Cursor: max erp_out_id stored in igi_certificate_out_sync.
 */

import { fetchCertificateOuts } from './lovelabCertificates'
import { serialFromDescription } from './stockLabel'

/**
 * @param {object} db supabase admin
 * @param {{ fetchOuts?: Function, limit?: number }} opts
 */
export async function syncCertificateOuts(db, opts = {}) {
  const fetchOuts = opts.fetchOuts || fetchCertificateOuts
  const limit = opts.limit || 200

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
      since_id: sinceId,
      fetched: 0,
      inserted: 0,
      matched: 0,
      unmatched: [],
    }
  }

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
  const unmatched = []
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

  const { error: upsertErr } = await db
    .from('igi_certificate_out_sync')
    .upsert(inserts, { onConflict: 'erp_out_id' })

  if (upsertErr) throw upsertErr

  const maxId = Math.max(...rows.map((r) => Number(r.id) || 0), sinceId)

  return {
    since_id: sinceId,
    next_since_id: maxId,
    fetched: rows.length,
    inserted: inserts.length,
    matched,
    unmatched: unmatched.slice(0, 20),
  }
}
