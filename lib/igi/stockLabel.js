/**
 * One-line stock label matching LoveLab certificate_master / Certificates Stock UI.
 *
 * B2B Stock ModelCell shows:
 *   name
 *   serial · {stones} × {carat} {shape}[ · spec]
 *
 * LoveLab masters store that as a single string joined with " · ".
 */

export function formatCarat(carat) {
  if (carat == null || carat === '') return null
  return String(carat).replace('.', ',')
}

/**
 * @param {{ name?: string|null, serial?: string|null, stones?: string|null,
 *           carat?: number|string|null, shape?: string|null, spec?: string|null }} model
 * @returns {string}
 */
export function stockLabel(model) {
  if (!model) return ''

  const parts = []
  if (model.name && model.name !== '—') parts.push(String(model.name).trim())

  const specBits = []
  if (model.serial) specBits.push(String(model.serial).trim())

  const mid = [
    model.stones ? `${model.stones} ×` : null,
    formatCarat(model.carat),
    model.shape ? String(model.shape).trim() : null,
  ].filter(Boolean).join(' ')

  if (mid) specBits.push(mid)
  if (model.spec) specBits.push(String(model.spec).trim())

  if (specBits.length) parts.push(specBits.join(' · '))
  return parts.join(' · ')
}

/** Pull LGAJxxxx (or similar) from a LoveLab description for matching. */
export function serialFromDescription(description) {
  if (!description) return null
  const m = String(description).match(/\b(LGAJ\d+)\b/i)
  return m ? m[1].toUpperCase() : null
}
