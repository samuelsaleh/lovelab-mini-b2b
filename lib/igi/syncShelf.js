/**
 * The nightly shelf read.
 *
 * LoveLab's software knows nothing about serials — it returns free text and a
 * piece count, with no product code, id or SKU. So a person links each
 * description to a model once (the Matching screen), and from then on the shelf
 * figure arrives on its own: this job reads the ERP, stores a dated snapshot,
 * and follows the mapping.
 *
 * Yesterday minus today is what got packed, measured with nobody typing anything.
 */

import { fetchPackingStock } from './lovelabStock'
import { brusselsToday } from './dates'

/**
 * @param {object} adminSupabase  service-role client
 * @param {object} [opts]
 * @param {string} [opts.today]   business day override, for tests
 * @param {Function} [opts.fetchStock] injectable reader, for tests
 */
export async function syncShelfSnapshot(adminSupabase, opts = {}) {
  const today = opts.today || brusselsToday()
  const read = opts.fetchStock || fetchPackingStock
  const startedAt = new Date().toISOString()

  const payload = await read()
  const lines = payload.data

  // The count the ERP reports about itself. A mismatch means a truncated
  // payload, which must not be allowed to look like stock disappearing.
  const truncated = Number.isInteger(payload.count) && payload.count !== lines.length

  const { data: known, error: descErr } = await adminSupabase
    .from('igi_descriptions')
    .select('description, model_id, kind')
  if (descErr) throw new Error(`could not read the mapping table: ${descErr.message}`)

  const byDescription = new Map((known || []).map((d) => [d.description, d]))

  const snapshots = []
  const unknown = []
  let matched = 0

  for (const line of lines) {
    const description = line.description
    // Number(null) is 0, not NaN, so an absent count must be rejected before
    // the conversion — writing it as zero would read as a shelf emptying
    // overnight and fire a collection alert for stock that is still there.
    const raw = line.total_pcs
    if (raw === null || raw === undefined || raw === '') continue
    const totalPcs = Number(raw)
    if (!description || !Number.isFinite(totalPcs) || totalPcs < 0) continue

    const mapping = byDescription.get(description)

    if (!mapping) {
      // Never guessed at. A description we have not seen is recorded so a human
      // can link it, and classified only by whether it mentions IGI at all —
      // that is a category, not a model.
      unknown.push({
        description,
        model_id: null,
        kind: /IGI/i.test(description) ? 'certificate' : 'ignore',
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
    }

    if (mapping?.model_id) matched += 1

    snapshots.push({
      snapshot_date: today,
      description,
      total_pcs: totalPcs,
      model_id: mapping?.model_id ?? null,
    })
  }

  if (unknown.length) {
    const { error } = await adminSupabase
      .from('igi_descriptions')
      .upsert(unknown, { onConflict: 'description', ignoreDuplicates: true })
    if (error) throw new Error(`could not record new descriptions: ${error.message}`)
  }

  // Upserting on (snapshot_date, description) makes a re-run of the same day
  // safe — the mapping can be corrected and the day re-read.
  const { error: snapErr } = await adminSupabase
    .from('igi_shelf_snapshots')
    .upsert(snapshots, { onConflict: 'snapshot_date,description' })
  if (snapErr) throw new Error(`could not write the snapshot: ${snapErr.message}`)

  await adminSupabase
    .from('igi_descriptions')
    .update({ last_seen_at: new Date().toISOString() })
    .in('description', lines.map((l) => l.description))

  // A description that was mapped and has now stopped appearing is the failure
  // that costs the most: somebody renamed it upstream, and that model's shelf
  // figure silently freezes. We never write it as zero — that would fire a false
  // "go collect" and report a whole shelf as consumed in one night — so it has
  // to be reported instead.
  const seen = new Set(lines.map((l) => l.description))
  const vanished = (known || [])
    .filter((d) => d.model_id && !seen.has(d.description))
    .map((d) => d.description)

  return {
    snapshot_date: today,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    lines_read: lines.length,
    reported_count: payload.count ?? null,
    truncated,
    matched,
    new_descriptions: unknown.map((u) => u.description),
    vanished_descriptions: vanished,
    certificates_on_shelf: totalOnShelf(snapshots, byDescription),
  }
}

/** Pieces sitting on the shelf that belong to a model we know about. */
function totalOnShelf(snapshots, byDescription) {
  return snapshots.reduce((total, s) => {
    const mapping = byDescription.get(s.description)
    return mapping?.model_id ? total + s.total_pcs : total
  }, 0)
}
