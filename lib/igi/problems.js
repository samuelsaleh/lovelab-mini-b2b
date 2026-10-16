/**
 * IGI report a problem with a request; LoveLab answer it.
 *
 * Mika (IGI), 16 Oct 2026, about V-041: "tu demandes 96 pcs mais il n'y a que
 * 60 de ce modèle, et le reste c'est le LGAJ6575 — je n'ai pas la possibilité
 * de rajouter un modèle dans une commande." IGI could only type what they made
 * against the lines LoveLab asked for, so a wrong request went back by WhatsApp.
 *
 * Sam chose the shape: IGI flag what they think is wrong, the request waits,
 * LoveLab are emailed and decide. IGI never change a request themselves —
 * they bill per card, and what LoveLab buy is LoveLab's call — but their
 * proposal is kept beside it, so accepting it is one click.
 *
 *   requested ──reportProblem (IGI)──▶ on_hold ──resolveProblem (LoveLab)──▶ requested
 *
 * A proposal names models and the quantity IGI think each should carry:
 * a model already on the request at a new figure, a model to add, or 0 to take
 * one off. Lines it does not name stay as they are. Quantities are absolute,
 * never "+36", so applying the same answer twice gives the same request — a
 * resolve interrupted half-way can simply be pressed again.
 */
import { readRequestLines, whyNotRequestable } from './visits'
import { visitRef } from './derive'

export const NOTE_MAX = 1000

/** Postgres "relation does not exist": the problems table has not been created yet. */
export function isMissingProblemsTable(error) {
  return error?.code === '42P01' || /igi_visit_problems/.test(String(error?.message || ''))
}

/**
 * Reads what IGI typed. `lines` are the request's current lines, `models` the
 * in-use models IGI may name. Returns { note, proposal } or { error }.
 */
export function readProblemReport(raw, lines, models) {
  const note = typeof raw?.note === 'string' ? raw.note.trim() : ''
  if (!note) return { error: 'Say in a few words what is wrong.' }
  if (note.length > NOTE_MAX) return { error: `Keep it under ${NOTE_MAX} characters.` }

  const list = raw?.proposal == null ? [] : raw.proposal
  if (!Array.isArray(list)) return { error: 'The suggested quantities could not be read.' }
  if (list.length > 200) return { error: 'That is too many models for one request.' }

  const current = new Map((lines || []).map((l) => [l.model_id, l.qty_requested]))
  const usable = new Map((models || []).map((m) => [m.id, m]))
  const seen = new Set()
  const proposal = []

  for (const entry of list) {
    const modelId = entry?.model_id
    if (typeof modelId !== 'string' || !modelId) return { error: 'One of the suggestions has no model.' }
    if (entry?.qty === '' || entry?.qty === null || entry?.qty === undefined) continue
    const qty = Number(entry.qty)
    if (!Number.isInteger(qty) || qty < 0) {
      return { error: 'Every quantity must be a whole number, zero or more.' }
    }
    if (seen.has(modelId)) return { error: 'The same model is suggested twice.' }
    seen.add(modelId)

    const onRequest = current.has(modelId)
    if (!onRequest && !usable.has(modelId)) return { error: 'One of the suggested models cannot be asked for.' }
    if (onRequest && current.get(modelId) === qty) continue // no change
    if (!onRequest && qty === 0) continue // removing what is not there
    proposal.push({ model_id: modelId, qty })
  }

  return { note, proposal }
}

/** The request's lines once a proposal is applied: [{ model_id, qty }], nothing at 0. */
export function applyProposal(lines, proposal) {
  const out = new Map((lines || []).map((l) => [l.model_id, l.qty_requested]))
  for (const p of proposal || []) out.set(p.model_id, p.qty)
  return [...out].filter(([, qty]) => qty > 0).map(([model_id, qty]) => ({ model_id, qty }))
}

/**
 * What a proposal changes, line by line, for the screens and the emails:
 * [{ model_id, serial, name, stones, carat, shape, spec, from, to }].
 * `from` is null for a model IGI add.
 */
export function describeProposal(lines, proposal, modelById) {
  const asked = new Map((lines || []).map((l) => [l.model_id, l.qty_requested]))
  return (proposal || []).map((p) => {
    const m = modelById?.get(p.model_id) || {}
    return {
      model_id: p.model_id,
      serial: m.serial ?? null,
      name: m.name ?? 'Unknown model',
      stones: m.stones ?? null,
      carat: m.carat ?? null,
      shape: m.shape ?? null,
      spec: m.spec ?? null,
      from: asked.has(p.model_id) ? asked.get(p.model_id) : null,
      to: p.qty,
    }
  })
}

/**
 * IGI report a problem. `db` is IGI's own client (row level security decides
 * what they may do) or, in LoveLab's preview, the service-role client.
 * Returns { status, body } or { error, message }, like recordProduction.
 */
export async function reportProblem(db, userId, visitId, raw) {
  const { data: visit, error: visitErr } = await db
    .from('igi_visits').select('id, visit_no, status').eq('id', visitId).maybeSingle()
  if (visitErr) return { error: visitErr, message: 'Could not report the problem' }
  if (!visit) return { status: 404, body: { error: 'That request no longer exists' } }
  if (visit.status === 'on_hold') {
    return { status: 409, body: { error: 'You have already reported a problem on this one. LoveLab will answer.' } }
  }
  if (visit.status !== 'requested') {
    return { status: 409, body: { error: 'This one has already been sent back to LoveLab.' } }
  }

  const [lines, models] = await Promise.all([
    db.from('igi_visit_lines').select('model_id, qty_requested').eq('visit_id', visitId),
    db.from('igi_models').select('id, state').eq('state', 'in_use'),
  ])
  for (const r of [lines, models]) {
    if (r.error) return { error: r.error, message: 'Could not report the problem' }
  }

  const read = readProblemReport(raw, lines.data, models.data)
  if (read.error) return { status: 400, body: { error: read.error } }

  const { data: problemId, error } = await db.rpc('igi_report_problem', {
    p_visit_id: visitId,
    p_user: userId,
    p_note: read.note,
    p_proposal: read.proposal,
  })
  if (error) {
    if (/igi_visit_not_waiting/.test(error.message || '')) {
      return { status: 409, body: { error: 'This request is no longer waiting on you.' } }
    }
    return { error, message: 'Could not report the problem' }
  }

  return { status: 200, body: { visit_no: visit.visit_no, problem_id: problemId, changes: read.proposal.length } }
}

const ACTIONS = new Set(['accept', 'edit', 'keep'])
const RESOLUTION = { accept: 'accepted', edit: 'edited', keep: 'kept' }

/**
 * LoveLab answer. `db` is the service-role client.
 *
 *   accept  apply IGI's proposal
 *   edit    replace the lines with body.lines ([{ model_id, qty }], as on a new request)
 *   keep    change nothing
 *
 * Either way the request goes back on IGI's To do. Returns { status, body }
 * or { error, message }.
 */
export async function resolveProblem(db, userId, visitId, raw) {
  const action = raw?.action
  if (!ACTIONS.has(action)) return { status: 400, body: { error: 'Choose accept, edit or keep.' } }
  const reply = typeof raw?.reply === 'string' ? raw.reply.trim() : ''
  if (reply.length > NOTE_MAX) return { status: 400, body: { error: `Keep the reply under ${NOTE_MAX} characters.` } }

  const { data: visit, error: visitErr } = await db
    .from('igi_visits').select('id, visit_no, status').eq('id', visitId).maybeSingle()
  if (visitErr) return { error: visitErr, message: 'Could not answer IGI' }
  if (!visit) return { status: 404, body: { error: 'That movement does not exist.' } }
  if (visit.status !== 'on_hold') {
    return { status: 409, body: { error: `${visitRef(visit)} is not on hold.` } }
  }

  const [problemRes, linesRes] = await Promise.all([
    db.from('igi_visit_problems').select('id, proposal')
      .eq('visit_id', visitId).is('resolved_at', null).maybeSingle(),
    db.from('igi_visit_lines').select('id, model_id, qty_requested').eq('visit_id', visitId),
  ])
  for (const r of [problemRes, linesRes]) {
    if (r.error) return { error: r.error, message: 'Could not answer IGI' }
  }
  const problem = problemRes.data
  const lines = linesRes.data || []

  let target = lines.map((l) => ({ model_id: l.model_id, qty: l.qty_requested }))
  if (action === 'accept') {
    if (!problem) return { status: 409, body: { error: 'IGI’s report could not be found.' } }
    target = applyProposal(lines, problem.proposal)
  } else if (action === 'edit') {
    const read = readRequestLines(raw?.lines)
    if (read.error) return { status: 400, body: { error: read.error } }
    target = read.lines
  }
  if (!target.length) {
    return { status: 400, body: { error: 'That leaves nothing on the request. Delete the movement instead.' } }
  }

  // Any model new to the request must be one that can be asked for.
  const existing = new Map(lines.map((l) => [l.model_id, l]))
  const added = target.filter((t) => !existing.has(t.model_id)).map((t) => t.model_id)
  if (added.length) {
    const { data: models, error } = await db
      .from('igi_models').select('id, serial, name, state').in('id', added)
    if (error) return { error, message: 'Could not answer IGI' }
    const byId = new Map((models || []).map((m) => [m.id, m]))
    for (const id of added) {
      const reason = whyNotRequestable(byId.get(id))
      if (reason) return { status: 400, body: { error: reason } }
    }
  }

  const wanted = new Map(target.map((t) => [t.model_id, t.qty]))
  for (const line of lines) {
    if (!wanted.has(line.model_id)) {
      const { error } = await db.from('igi_visit_lines').delete().eq('id', line.id)
      if (error) return { error, message: 'Could not update the request' }
    } else if (wanted.get(line.model_id) !== line.qty_requested) {
      const { error } = await db.from('igi_visit_lines')
        .update({ qty_requested: wanted.get(line.model_id) }).eq('id', line.id)
      if (error) return { error, message: 'Could not update the request' }
    }
  }
  if (added.length) {
    const { error } = await db.from('igi_visit_lines').insert(
      added.map((modelId) => ({ visit_id: visitId, model_id: modelId, qty_requested: wanted.get(modelId) })),
    )
    if (error) return { error, message: 'Could not update the request' }
  }

  const now = new Date().toISOString()
  if (problem) {
    const { error } = await db.from('igi_visit_problems').update({
      resolution: RESOLUTION[action],
      reply: reply || null,
      resolved_by: userId,
      resolved_at: now,
    }).eq('id', problem.id)
    if (error) return { error, message: 'Could not answer IGI' }
  }

  const { error: statusErr } = await db.from('igi_visits')
    .update({ status: 'requested' }).eq('id', visitId).eq('status', 'on_hold')
  if (statusErr) return { error: statusErr, message: 'Could not send it back to IGI' }

  return {
    status: 200,
    body: {
      visit_no: visit.visit_no,
      resolution: RESOLUTION[action],
      total: target.reduce((t, l) => t + l.qty, 0),
    },
  }
}
