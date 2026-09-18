/**
 * Pull LoveLab Certificate In rows into B2B (ERP → B2B).
 *
 * Full ledger mirror (including rows B2B originally pushed with visit:…).
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
 * @param {{ fetchIns?: Function, limit?: number }} opts
 */
export async function syncCertificateIns(db, opts = {}) {
  const fetchIns = opts.fetchIns || fetchCertificateIns
  const limit = opts.limit || 200

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
      since_id: sinceId,
      fetched: 0,
      inserted: 0,
      matched: 0,
      from_b2b: 0,
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

  const { error: upsertErr } = await db
    .from('igi_certificate_in_sync')
    .upsert(inserts, { onConflict: 'erp_in_id' })

  if (upsertErr) throw upsertErr

  const maxId = Math.max(...rows.map((r) => Number(r.id) || 0), sinceId)

  return {
    since_id: sinceId,
    next_since_id: maxId,
    fetched: rows.length,
    inserted: inserts.length,
    matched,
    from_b2b: fromB2b,
    unmatched: unmatched.slice(0, 20),
  }
}
