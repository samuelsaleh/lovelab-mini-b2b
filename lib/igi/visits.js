/**
 * Shared rules for a movement (a visit).
 *
 * One movement is a sortie — certificates go across the road — followed by a
 * retour, when they come back attached to the bracelets. Two movements on the
 * same day are two movements, not one.
 */

/** requested → issued → closed. It only ever moves forward. */
export const VISIT_FLOW = { requested: 'issued', issued: 'closed', closed: null }

export const VISIT_LABELS = {
  requested: 'Waiting on IGI',
  issued: 'Ready to receive',
  closed: 'Closed',
}

export const VISIT_TONES = { requested: 'watch', issued: 'now', closed: 'fine' }

/**
 * Whether a movement may move to `next`.
 *
 * Reopening a closed movement is refused rather than supported: the certificates
 * have physically been packed by then, and a correction belongs in a new
 * movement where it stays visible.
 */
export function canAdvance(from, next) {
  return VISIT_FLOW[from] === next
}

/**
 * Whether a model may be asked for.
 *
 * A reserved serial was numbered by IGI but never ordered, and is kept off every
 * operational screen. A model still waiting for a serial cannot be produced at
 * all — there is nothing to print on the card.
 */
export function canBeRequested(model) {
  return model?.state === 'in_use'
}

export function whyNotRequestable(model) {
  if (!model) return 'That model does not exist.'
  if (model.state === 'reserved') {
    return `${model.serial} is a reserved serial — it was numbered but never ordered.`
  }
  if (model.state === 'awaiting_serial') {
    return `${model.name} is still waiting for a serial from IGI, so it cannot be made yet.`
  }
  return null
}

/**
 * Normalises the lines on a new request, dropping anything asking for nothing.
 * Returns { lines, error } — never throws, so the route can answer plainly.
 */
export function readRequestLines(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Choose at least one model.' }
  }
  if (raw.length > 200) {
    return { error: 'That is too many models for one movement.' }
  }

  const seen = new Set()
  const lines = []

  for (const line of raw) {
    const modelId = line?.model_id
    const qty = Number(line?.qty)

    if (typeof modelId !== 'string' || !modelId) {
      return { error: 'One of the lines has no model.' }
    }
    if (!Number.isInteger(qty) || qty < 0) {
      return { error: 'Every quantity must be a whole number, zero or more.' }
    }
    if (qty === 0) continue

    // A model appears at most once per movement, so the stock is counted once.
    if (seen.has(modelId)) {
      return { error: 'The same model is listed twice. Put the whole quantity on one line.' }
    }
    seen.add(modelId)
    lines.push({ model_id: modelId, qty })
  }

  if (!lines.length) return { error: 'Every line asks for nothing.' }
  return { lines }
}

/**
 * Reads the quantities IGI actually produced, keyed by model.
 *
 * Fewer than asked is normal and must be accepted without complaint. More than
 * asked is unusual but physically possible, so it is allowed through and shown
 * rather than rejected at five o'clock on a Friday.
 */
export function readIssuedQuantities(raw, lines) {
  if (!raw || typeof raw !== 'object') {
    return { error: 'Say how many of each model were made.' }
  }

  const byModel = new Map()
  for (const line of lines) {
    const value = raw[line.model_id]
    // A model left blank is taken as "all of them", which is the normal case.
    const qty = value === undefined || value === null || value === ''
      ? line.qty_requested
      : Number(value)

    if (!Number.isInteger(qty) || qty < 0) {
      return { error: 'Every quantity must be a whole number, zero or more.' }
    }
    byModel.set(line.model_id, qty)
  }

  return { byModel }
}
