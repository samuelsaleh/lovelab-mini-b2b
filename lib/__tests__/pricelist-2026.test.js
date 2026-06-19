/**
 * Pins the catalog's 2026 prices to the official source-of-truth PDF
 * (Pricelist_LoveLab_2026.pdf, uploaded 2026-06-19). Every row below is
 * transcribed straight from that PDF: [B2B €, B2C incl. 21% €] keyed by the
 * carat string the catalog uses.
 *
 * Collections NOT printed on that PDF (HOLY bracelet, and the admin-only
 * preview families Moonlight / Sienna / Iconix) are intentionally omitted —
 * they keep their own catalog values and are out of scope for this list.
 *
 * If this test fails, the catalog drifted from the printed pricelist: fix the
 * catalog, never the expectations (unless a NEW official PDF is issued).
 */

import { COLLECTIONS, getPrice, getRetail } from '../catalog'

const YEAR = '2026'

// [B2B, B2C] per carat string, per certificate.
const PRICELIST_2026 = {
  // ─── Bracelets ───
  CUTY:  { igi: { '0.05': [30, 105], '0.10': [40, 155], '0.20': [70, 315], '0.30': [100, 430] },
           inhouse: { '0.05': [24, 75], '0.10': [34, 120] } },
  CUBIX: { igi: { '0.05': [30, 120], '0.10': [40, 155], '0.20': [70, 340] },
           inhouse: { '0.05': [24, 95], '0.10': [34, 145] } },
  M3:    { igi: { '0.15': [65, 260], '0.30': [95, 400], '0.60': [175, 800], '0.90': [250, 1150] } },
  M4:    { igi: { '0.20': [85, 360], '0.40': [110, 500] } },
  M5:    { igi: { '0.25': [95, 400], '0.50': [130, 580] } },
  MF:    { igi: { '0.60': [200, 550], '1.00': [310, 885] } },
  SSF:   { igi: { '0.10': [55, 180], '0.30': [100, 330], '0.50': [155, 450] } },
  SSPF:  { igi: { '0.70': [240, 550], '1.00': [325, 850] } },
  SSRG:  { inhouse: { '0.50': [125, 290], '0.70': [165, 360], '1.00': [225, 500] } },
  SSRD:  { igi: { '0.50': [200, 550], '0.70': [220, 650], '1.00': [305, 850] } },

  // ─── Necklaces ───
  CUTY_NECK:  { igi: { '0.10': [50, 195], '0.20': [88, 395], '0.30': [125, 540] } },
  CUBIX_NECK: { igi: { '0.05': [36, 145], '0.10': [48, 190], '0.20': [84, 410] } },
  M3_NECK:    { igi: { '0.15': [81, 325], '0.30': [119, 500], '0.60': [219, 1000] } },
  M4_NECK:    { igi: { '0.20': [106, 450], '0.40': [138, 625] } },
  M5_NECK:    { igi: { '0.25': [114, 480], '0.50': [156, 700] } },
  MF_NECK:    { igi: { '0.60': [240, 660], '1.00': [372, 1065] } },
  SSF_NECK:   { igi: { '0.10': [66, 220], '0.30': [120, 400], '0.50': [186, 540] } },
  SSPF_NECK:  { igi: { '0.70': [288, 660], '1.00': [390, 1020] } },
  HOLY_NECK:  { igi: { '0.50': [312, 780], '0.70': [510, 1200], '1.00': [660, 1590] } },
}

describe('2026 pricelist matches the official PDF', () => {
  for (const [id, byCert] of Object.entries(PRICELIST_2026)) {
    const col = COLLECTIONS.find((c) => c.id === id)

    it(`${id} exists in the catalog`, () => {
      expect(col).toBeTruthy()
    })

    if (!col) continue

    for (const [cert, byCarat] of Object.entries(byCert)) {
      for (const [carat, [b2b, b2c]] of Object.entries(byCarat)) {
        const idx = col.carats.indexOf(carat)
        it(`${id} ${cert} ${carat}ct → B2B €${b2b} / B2C €${b2c}`, () => {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(getPrice(col, idx, cert, YEAR)).toBe(b2b)
          expect(getRetail(col, idx, cert, YEAR)).toBe(b2c)
        })
      }
    }
  }
})
