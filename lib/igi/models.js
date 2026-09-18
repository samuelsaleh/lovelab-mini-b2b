/**
 * Shared rules for a certificate model.
 *
 * The one rule so far: which models may be deleted. Same line the movements
 * draw in lib/igi/visits.js — the record cannot be deleted, a test can.
 *
 * Sam, 18 Sept 2026: "how can I delete some there manually?" He had just
 * added "Sam Test 1" to see the New model form work, and nothing could take
 * it back. A model still waiting for IGI's serial has no serial, no batch,
 * no movement line and no shelf line: removing it loses nothing. A numbered
 * model is the opposite — its serial is on printed certificates and the
 * movements refer to it — so it is never deletable from a screen, however
 * hard anyone clicks. A reserved serial is IGI's number; it stays too.
 */
export function whyNotDeletableModel(model) {
  if (!model) return 'That model does not exist.'
  if (model.state === 'awaiting_serial') return null
  const who = model.serial || model.name || 'This model'
  return `${who} is ${model.state === 'reserved' ? 'a reserved serial' : 'in use'}. A numbered model is never deleted — its serial is on printed certificates and the movements refer to it.`
}

export function canDeleteModel(model) {
  return whyNotDeletableModel(model) === null
}
