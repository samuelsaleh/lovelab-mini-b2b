/**
 * Push B2B IGI model stock labels into LoveLab certificate_master
 * so Certificate In/Out dropdowns and API validation stay in sync.
 */

import { stockLabel } from './stockLabel'
import { upsertCertificateMasters } from './lovelabCertificates'

/**
 * @param {object} model  igi_models row (needs serial for a useful ERP label)
 * @returns {string|null}
 */
export function masterLabelForModel(model) {
  if (!model?.serial) return null
  const label = stockLabel(model)
  return label || null
}

/**
 * Push one or many models to ERP certificate_master.
 * @param {object|object[]} models
 * @param {{ upsert?: Function }} opts
 */
export async function pushModelsToCertificateMaster(models, opts = {}) {
  const upsert = opts.upsert || upsertCertificateMasters
  const list = Array.isArray(models) ? models : [models]
  const names = [...new Set(list.map(masterLabelForModel).filter(Boolean))]
  if (!names.length) {
    return { skipped: true, reason: 'no_serial_labels', count: 0 }
  }
  const result = await upsert({ names })
  return { skipped: false, count: names.length, names, result }
}

/**
 * Sync every in_use / numbered model to ERP (cron).
 * @param {object} db supabase admin
 */
export async function syncAllModelsToCertificateMaster(db, opts = {}) {
  const { data, error } = await db
    .from('igi_models')
    .select('id, serial, name, stones, carat, shape, spec, state')
    .not('serial', 'is', null)
    .in('state', ['in_use', 'reserved'])

  if (error) throw error
  return pushModelsToCertificateMaster(data || [], opts)
}
