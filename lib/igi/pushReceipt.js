/**
 * Push a closed visit's received quantities into LoveLab Certificate In.
 *
 * Uses igi_receipts for idempotency: the same visit reference is never posted twice
 * as applied. Failed posts stay failed and can be retried.
 */

import { stockLabel } from './stockLabel'
import { postCertificateIn } from './lovelabCertificates'

export function receiptReference(visit) {
  return `visit:${visit.id}`
}

/**
 * Build ERP line items from visit lines + models.
 * @returns {Array<{ description: string, pcs: number, model_id: string }>}
 */
export function buildReceiptItems(lines, modelsById) {
  const items = []
  for (const line of lines || []) {
    const qty = Number(line.qty_received ?? 0)
    if (!Number.isFinite(qty) || qty <= 0) continue

    const model = modelsById.get(line.model_id) || modelsById[line.model_id]
    if (!model) {
      throw new Error(`Model ${line.model_id} missing for ERP receipt`)
    }

    const description = stockLabel(model)
    if (!description) {
      throw new Error(`Cannot build stock label for model ${model.id || line.model_id}`)
    }

    items.push({
      description,
      pcs: qty,
      model_id: line.model_id,
    })
  }
  return items
}

/**
 * @param {object} db - supabase admin client
 * @param {{ visit: { id: string, visit_no?: string }, lines: array, models: array }} args
 * @param {{ postIn?: Function }} opts
 */
export async function pushVisitReceiptToLovelab(db, { visit, lines, models }, opts = {}) {
  const postIn = opts.postIn || postCertificateIn
  const ref = receiptReference(visit)

  const { data: existing, error: existingErr } = await db
    .from('igi_receipts')
    .select('id, status, reference, response')
    .eq('reference', ref)
    .maybeSingle()

  if (existingErr) throw existingErr
  if (existing?.status === 'applied') {
    return { skipped: true, reason: 'already_applied', receipt: existing }
  }

  const modelsById = new Map((models || []).map((m) => [m.id, m]))
  const items = buildReceiptItems(lines, modelsById)

  if (!items.length) {
    return { skipped: true, reason: 'no_qty', items: [] }
  }

  let receiptId = existing?.id
  if (!receiptId) {
    const { data: inserted, error: insErr } = await db
      .from('igi_receipts')
      .insert({
        visit_id: visit.id,
        reference: ref,
        status: 'pending',
      })
      .select('id, status, reference')
      .single()
    if (insErr) throw insErr
    receiptId = inserted.id
  } else {
    await db.from('igi_receipts').update({ status: 'pending' }).eq('id', receiptId)
  }

  try {
    const response = await postIn({
      party: 'IGI',
      external_ref: ref,
      items: items.map(({ description, pcs }) => ({ description, pcs })),
    })

    const { data: applied, error: updErr } = await db
      .from('igi_receipts')
      .update({
        status: 'applied',
        posted_at: new Date().toISOString(),
        response,
      })
      .eq('id', receiptId)
      .select('id, status, reference, posted_at, response')
      .single()

    if (updErr) throw updErr

    return { ok: true, receipt: applied, items, invoice_no: response?.invoice_no }
  } catch (err) {
    await db
      .from('igi_receipts')
      .update({
        status: 'failed',
        posted_at: new Date().toISOString(),
        response: { error: err?.message || 'push failed', status: err?.status || null, body: err?.body || null },
      })
      .eq('id', receiptId)

    throw err
  }
}

/**
 * Retry failed / pending receipts (cron).
 */
export async function retryFailedReceipts(db, opts = {}) {
  const postIn = opts.postIn || postCertificateIn
  const limit = opts.limit || 20

  const { data: rows, error } = await db
    .from('igi_receipts')
    .select('id, visit_id, reference, status')
    .in('status', ['failed', 'pending'])
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw error

  const results = []
  for (const row of rows || []) {
    const { data: visit } = await db
      .from('igi_visits')
      .select('id, visit_no, status')
      .eq('id', row.visit_id)
      .maybeSingle()

    if (!visit || visit.status !== 'closed') {
      results.push({ reference: row.reference, skipped: true, reason: 'visit_not_closed' })
      continue
    }

    const { data: lines } = await db
      .from('igi_visit_lines')
      .select('id, model_id, qty_received')
      .eq('visit_id', visit.id)

    const modelIds = [...new Set((lines || []).map((l) => l.model_id))]
    const { data: models } = await db
      .from('igi_models')
      .select('id, name, serial, stones, carat, shape, spec')
      .in('id', modelIds)

    try {
      const out = await pushVisitReceiptToLovelab(
        db,
        { visit, lines: lines || [], models: models || [] },
        { postIn },
      )
      results.push({ reference: row.reference, ...out })
    } catch (err) {
      results.push({ reference: row.reference, ok: false, error: err?.message || 'failed' })
    }
  }

  return results
}
