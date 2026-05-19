/**
 * Helpers for building / round-tripping custom packs.
 *
 * `linesToFormRows` converts the in-builder representation (a list of
 * `{ collectionId, colorConfigs }` objects with caratIdx, housing, etc.)
 * into the legacy "form_rows" format used by `applyPack` and stored in the
 * `packs.form_rows` JSONB column. This is the inverse of `applyPack` — keep
 * the two in lockstep so a saved pack can always be re-applied identically.
 */

import { COLLECTIONS, CERT_LABELS, CORD_TYPE_LABELS, getPrice, getRetail, getDefaultCert } from './catalog'

function findCollectionById(id) {
  return COLLECTIONS.find(c => c.id === id) || null
}

/**
 * Strip a "Bezel "/"Prong " prefix from a housing string into a setting +
 * a bare bpColor, mirroring what BuilderPage.applyPack expects on read.
 */
function splitHousing(housing) {
  if (!housing || typeof housing !== 'string') return { setting: '', color: '' }
  if (housing.startsWith('Bezel ')) return { setting: 'Bezel', color: housing.slice(6) }
  if (housing.startsWith('Prong ')) return { setting: 'Prong', color: housing.slice(6) }
  return { setting: '', color: housing }
}

function certLabelFor(col, certType) {
  const ct = certType || getDefaultCert(col)
  if (!ct) return ''
  return CERT_LABELS[ct] || ct
}

/**
 * Convert the builder's `lines` array into the persisted form_rows shape
 * that `applyPack` consumes. Each colorConfig becomes one row.
 *
 * Output row keys (all strings — matches the existing PACK*_ROWS constants):
 *   collection, carat, shape, bpColor, setting, size, colorCord, quantity,
 *   unitPrice, cert, closure, material.
 */
// `pricelistYear` is forwarded so a saved pack snapshot uses whichever
// year the agent had selected when they saved it. Defaults to undefined,
// which the catalog's getPrice falls back to DEFAULT_PRICELIST.
export function linesToFormRows(lines, { pricelistYear } = {}) {
  if (!Array.isArray(lines)) return []
  const rows = []
  for (const line of lines) {
    const col = findCollectionById(line?.collectionId)
    if (!col) continue
    for (const cfg of (line.colorConfigs || [])) {
      if (cfg.caratIdx == null) continue
      const carat = col.carats[cfg.caratIdx] || ''
      const certType = cfg.certType || getDefaultCert(col)
      const unitB2B = (cfg.priceOverride != null && cfg.priceOverride >= 0)
        ? cfg.priceOverride
        : getPrice(col, cfg.caratIdx, certType, pricelistYear)

      // For multiThree the housing is a setting+colour combo represented via
      // the multiAttached flag in the builder. We surface it as setting='F'
      // (attached) or setting='LO' (loose) on the row so applyPack can
      // reverse it cleanly.
      let setting = ''
      let bpColor = ''
      if (col.housing === 'multiThree') {
        if (cfg.multiAttached === true) setting = 'F'
        else if (cfg.multiAttached === false) setting = 'LO'
        bpColor = cfg.housing || ''
      } else {
        const split = splitHousing(cfg.housing)
        setting = split.setting
        bpColor = split.color
      }

      rows.push({
        collection: col.label,
        carat: String(carat),
        shape: cfg.shape || '',
        bpColor,
        setting,
        size: cfg.size || '',
        colorCord: cfg.colorName || '',
        quantity: String(cfg.qty || 1),
        unitPrice: String(unitB2B || ''),
        cert: certLabelFor(col, certType),
        closure: col.hasClosure ? (cfg.closureType || '') : '',
        material: cfg.cordType
          ? (cfg.thickness
              ? `${CORD_TYPE_LABELS[cfg.cordType] || cfg.cordType} (${cfg.thickness})`
              : (CORD_TYPE_LABELS[cfg.cordType] || cfg.cordType))
          : '',
      })
    }
  }
  return rows
}

/**
 * Compute the B2B total for a list of rows. Used by the modal to enforce
 * the €970 minimum without re-running the full calculateQuote pipeline.
 */
export function totalForFormRows(rows) {
  if (!Array.isArray(rows)) return 0
  let total = 0
  for (const r of rows) {
    const qty = parseInt(r.quantity, 10)
    const unit = parseFloat(r.unitPrice)
    if (Number.isFinite(qty) && Number.isFinite(unit)) total += qty * unit
  }
  return total
}

export const MIN_PACK_TOTAL = 970

// Suppress unused-import warning for getRetail — kept available for future
// retail-aware pack calculations (e.g. computing a B2C estimate alongside
// the B2B total). It's a no-op here.
void getRetail
