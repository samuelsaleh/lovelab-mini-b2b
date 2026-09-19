/**
 * Shelf read from LoveLab **certificate-stock** (In − Out), not packing-stock.
 *
 * Certificate lines already carry LGAJ serials in the description, so we match
 * them to igi_models automatically. That keeps "On our shelf" equal to the
 * Certificate ledger instead of old packing lines like "IGI 0.05 CERTIFICATE".
 */

import { fetchCertificateStock } from './lovelabCertificates'
import { serialFromDescription } from './stockLabel'
import { brusselsToday } from './dates'

/**
 * @param {object} adminSupabase  service-role client
 * @param {object} [opts]
 * @param {string} [opts.today]
 * @param {Function} [opts.fetchStock] injectable reader (tests)
 */
export async function syncShelfSnapshot(adminSupabase, opts = {}) {
  const today = opts.today || brusselsToday()
  const read = opts.fetchStock || fetchCertificateStock
  const startedAt = new Date().toISOString()

  const payload = await read({ country_stock: 'BELGIUM' })
  const lines = payload.data || []

  const truncated = Number.isInteger(payload.count) && payload.count !== lines.length

  const { data: models, error: modelErr } = await adminSupabase
    .from('igi_models')
    .select('id, serial, name')
    .not('serial', 'is', null)
  if (modelErr) throw new Error(`could not read models: ${modelErr.message}`)

  const bySerial = new Map(
    (models || [])
      .filter((m) => m.serial)
      .map((m) => [String(m.serial).toUpperCase(), m]),
  )

  const { data: known, error: descErr } = await adminSupabase
    .from('igi_descriptions')
    .select('description, model_id, kind')
  if (descErr) throw new Error(`could not read the mapping table: ${descErr.message}`)

  const snapshots = []
  const descriptionUpserts = []
  let matched = 0

  for (const line of lines) {
    const description = line.description
    const raw = line.total_pcs
    if (raw === null || raw === undefined || raw === '') continue
    const totalPcs = Number(raw)
    if (!description || !Number.isFinite(totalPcs) || totalPcs < 0) continue

    const serial = serialFromDescription(description)
    const model = serial ? bySerial.get(serial) : null
    if (model) matched += 1

    snapshots.push({
      snapshot_date: today,
      description,
      total_pcs: totalPcs,
      model_id: model?.id ?? null,
    })

    descriptionUpserts.push({
      description,
      model_id: model?.id ?? null,
      kind: 'certificate',
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
  }

  if (descriptionUpserts.length) {
    const { error } = await adminSupabase
      .from('igi_descriptions')
      .upsert(descriptionUpserts, { onConflict: 'description' })
    if (error) throw new Error(`could not record descriptions: ${error.message}`)
  }

  const { error: snapErr } = await adminSupabase
    .from('igi_shelf_snapshots')
    .upsert(snapshots, { onConflict: 'snapshot_date,description' })
  if (snapErr) throw new Error(`could not write the snapshot: ${snapErr.message}`)

  // Models that had a certificate-stock line before but not today → report
  // (do not zero them; that would fake a full shelf empty overnight).
  const seenSerials = new Set(
    lines.map((l) => serialFromDescription(l.description)).filter(Boolean),
  )
  const vanished = (models || [])
    .filter((m) => m.serial && !seenSerials.has(String(m.serial).toUpperCase()))
    .map((m) => stockLabelHint(m))

  // Also flag old packing mappings that no longer appear in certificate-stock.
  const seenDesc = new Set(lines.map((l) => l.description))
  const vanishedMapped = (known || [])
    .filter((d) => d.model_id && d.kind === 'certificate' && !seenDesc.has(d.description))
    .map((d) => d.description)

  return {
    snapshot_date: today,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    source: 'certificate-stock',
    lines_read: lines.length,
    reported_count: payload.count ?? null,
    truncated,
    matched,
    new_descriptions: descriptionUpserts
      .filter((u) => !(known || []).some((k) => k.description === u.description))
      .map((u) => u.description),
    vanished_descriptions: [...new Set([...vanishedMapped, ...vanished])],
    certificates_on_shelf: snapshots
      .filter((s) => s.model_id)
      .reduce((t, s) => t + s.total_pcs, 0),
  }
}

function stockLabelHint(m) {
  return m.serial ? `${m.name || '—'} · ${m.serial}` : (m.name || '—')
}
