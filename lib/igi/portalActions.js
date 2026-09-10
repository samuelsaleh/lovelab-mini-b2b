/**
 * The three things anyone can do from IGI's side of the road.
 *
 * These take a database handle and a user id rather than making their own, so
 * the same implementation serves both callers:
 *
 *   IGI themselves, through /api/igi-portal/*, running as their own user with
 *   row level security between the companies.
 *
 *   A LoveLab admin driving the preview, through /api/igi/preview/*, running as
 *   the service role — because Sam has to be able to test IGI's half of the
 *   loop before IGI have a login, and a portal whose buttons do nothing cannot
 *   be tested at all.
 *
 * Attribution needs no special case: every row records the id of whoever acted.
 * When Sam records production it says Sam recorded it, which is the truth and
 * is exactly what you want to find later when the figures are queried.
 *
 * Each returns { status, body } for the route to hand back, so the validation
 * and the error wording are written once and cannot drift between the two.
 */

/** IGI record a production run. Their stock is the sum of these, never overwritten. */
export async function recordBatch(db, userId, body) {
  const { model_id: modelId, qty, batch_date: batchDate, reference, note } = body || {}

  if (typeof modelId !== 'string' || !modelId) {
    return { status: 400, body: { error: 'Choose a model.' } }
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    return { status: 400, body: { error: 'How many did you make?' } }
  }
  if (typeof batchDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(batchDate)) {
    return { status: 400, body: { error: 'Give the date they were made.' } }
  }

  const { data, error } = await db
    .from('igi_batches')
    .insert({
      model_id: modelId,
      qty,
      batch_date: batchDate,
      reference: typeof reference === 'string' ? reference.trim().slice(0, 120) || null : null,
      note: typeof note === 'string' ? note.trim().slice(0, 500) || null : null,
      created_by: userId,
    })
    .select('id, model_id, qty, batch_date, reference')
    .single()

  if (error) return { error, message: 'Could not save the batch' }
  return { status: 201, body: { batch: data } }
}

/** IGI's own alert level, on their own stock. LoveLab's is not writable here. */
export async function setPoolMin(db, userId, body) {
  const { model_ids: modelIds, pool_min: poolMin } = body || {}

  if (!Array.isArray(modelIds) || modelIds.length === 0) {
    return { status: 400, body: { error: 'Choose at least one model.' } }
  }
  if (modelIds.length > 200) {
    return { status: 400, body: { error: 'That is too many models at once.' } }
  }
  if (poolMin !== null && (!Number.isInteger(poolMin) || poolMin < 0)) {
    return { status: 400, body: { error: 'The level must be a whole number, zero or more.' } }
  }

  const { data, error } = await db
    .from('igi_models')
    .update({ pool_min: poolMin })
    .in('id', modelIds)
    .select('id, pool_min')

  if (error) return { error, message: 'Could not save the level' }
  return { status: 200, body: { updated: data || [] } }
}

/**
 * IGI record what they actually made.
 *
 * Fewer than asked is normal — they make what the stock they hold allows — so a
 * short quantity is accepted without complaint, and a model left blank means
 * they made everything that was asked for.
 */
export async function recordProduction(db, userId, visitId, body) {
  const { data: visit, error: visitErr } = await db
    .from('igi_visits').select('id, visit_no, status').eq('id', visitId).maybeSingle()

  if (visitErr) return { error: visitErr, message: 'Could not save what you made' }
  if (!visit) return { status: 404, body: { error: 'That request no longer exists' } }
  if (visit.status !== 'requested') {
    return { status: 409, body: { error: 'This one has already been sent back to LoveLab.' } }
  }

  const { data: lines, error: linesErr } = await db
    .from('igi_visit_lines').select('id, model_id, qty_requested').eq('visit_id', visitId)

  if (linesErr) return { error: linesErr, message: 'Could not save what you made' }

  const made = body?.made && typeof body.made === 'object' ? body.made : {}
  let total = 0

  for (const line of lines) {
    const raw = made[line.model_id]
    const qty = raw === undefined || raw === null || raw === ''
      ? line.qty_requested
      : Number(raw)

    if (!Number.isInteger(qty) || qty < 0) {
      return { status: 400, body: { error: 'Every quantity must be a whole number, zero or more.' } }
    }

    total += qty
    const { error } = await db.from('igi_visit_lines').update({ qty_issued: qty }).eq('id', line.id)
    if (error) return { error, message: 'Could not save what you made' }
  }

  const { error: statusErr } = await db
    .from('igi_visits')
    .update({ status: 'issued', issued_at: new Date().toISOString(), issued_by: userId })
    .eq('id', visitId)

  if (statusErr) return { error: statusErr, message: 'Could not send it back to LoveLab' }

  return { status: 200, body: { visit_no: visit.visit_no, made: total } }
}
