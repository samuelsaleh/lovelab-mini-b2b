import {
  COLLECTIONS,
  ADMIN_ONLY_COLLECTION_IDS,
  getVisibleCollections,
  isAdminOnlyCollection,
} from '@/lib/catalog'
import { ICONIX_PREVIEW_COLLECTION_IDS } from '@/lib/collectionAccess'
import { buildSystemPrompt, buildPricesBlock } from '@/lib/prompt'

const BASTIAN = { email: 'bastianmeyer319@hotmail.com', role: 'agent' }
const SARAH = { email: 'sarah@showroomaccestory.com', role: 'agent' }
const ICONIX_IDS = [...ICONIX_PREVIEW_COLLECTION_IDS]

// The 15 preview collections that only admins may see (Moonlight/Sienna/Iconix).
// The 2026 new necklaces are NOT preview-gated — everyone can see them.
const ADMIN_ONLY_IDS = [
  'MFM', 'MNO', 'MNH',
  'SI1', 'SI2P', 'SI3', 'SI4', 'SI5',
  'ZAHA', 'LUVA', 'LUMA', 'RIV4', 'RIV8',
  'LIN3', 'LIN5',
]

// Product labels that must never appear in a non-admin's AI prompt.
const ADMIN_ONLY_LABELS = [
  'Original Moonlight', 'Long Moonlight', 'Multi Moonlight',
  'Sienna One', 'Sienna Two', 'Sienna Three', 'Sienna Four', 'Sienna Five',
  'Za-Ha', 'Flower Heart', 'Flower Marquise', 'Riviera Four', 'Riviera Eight',
  'Linea Three', 'Linea Five',
]

describe('admin-only collection set', () => {
  it('contains exactly the preview collection ids', () => {
    expect([...ADMIN_ONLY_COLLECTION_IDS].sort()).toEqual([...ADMIN_ONLY_IDS].sort())
  })

  it('every admin-only id resolves to a real collection', () => {
    for (const id of ADMIN_ONLY_IDS) {
      expect(COLLECTIONS.find((c) => c.id === id)).toBeTruthy()
      expect(isAdminOnlyCollection(id)).toBe(true)
    }
  })

  it('legacy collections are not flagged admin-only', () => {
    const legacy = COLLECTIONS.filter((c) => !ADMIN_ONLY_IDS.includes(c.id))
    expect(legacy.length).toBeGreaterThan(0)
    for (const c of legacy) {
      expect(isAdminOnlyCollection(c.id)).toBe(false)
    }
  })
})

describe('getVisibleCollections', () => {
  it('admins see every sellable collection', () => {
    const visible = getVisibleCollections(true)
    // Nothing is retired today — SSRG came back in Sep 2026.
    expect(visible.map((c) => c.id)).toContain('SSRG')
    expect(visible).toHaveLength(COLLECTIONS.length)
  })

  it('non-admins never see any preview collection', () => {
    const visible = getVisibleCollections(false)
    const visibleIds = visible.map((c) => c.id)
    for (const id of ADMIN_ONLY_IDS) {
      expect(visibleIds).not.toContain(id)
    }
    expect(visibleIds).toContain('SSRG')
    // …and still see every legacy one, G/H included.
    expect(visible).toHaveLength(COLLECTIONS.length - ADMIN_ONLY_IDS.length)
  })

  it('treats a missing/falsy flag as non-admin', () => {
    expect(getVisibleCollections(undefined).length).toBe(COLLECTIONS.length - ADMIN_ONLY_IDS.length - 1)
  })
})

describe('getVisibleCollections — Bastian + Sarah partial Iconix access', () => {
  it.each([BASTIAN, SARAH])('includes the 6 Iconix collections for %s', (profile) => {
    const visibleIds = getVisibleCollections(profile).map((c) => c.id)
    for (const id of ICONIX_IDS) {
      expect(visibleIds).toContain(id)
    }
  })

  it.each([BASTIAN, SARAH])('excludes Moonlight, Sienna, and Za-Ha for %s', (profile) => {
    const visibleIds = getVisibleCollections(profile).map((c) => c.id)
    for (const id of ['MFM', 'MNO', 'MNH', 'SI1', 'SI2P', 'SI3', 'SI4', 'SI5', 'ZAHA']) {
      expect(visibleIds).not.toContain(id)
    }
  })
})

describe('AI system prompt gating', () => {
  it('admin prompt mentions every preview product', () => {
    const prompt = buildSystemPrompt('2026', { includeAdminOnly: true })
    for (const label of ADMIN_ONLY_LABELS) {
      expect(prompt).toContain(label)
    }
  })

  it('non-admin prompt hides every preview product name', () => {
    const prompt = buildSystemPrompt('2026', { includeAdminOnly: false })
    for (const label of ADMIN_ONLY_LABELS) {
      expect(prompt).not.toContain(label)
    }
    // Legacy products must still be present.
    expect(prompt).toContain('CUTY')
    expect(prompt).toContain('CUBIX')
    expect(prompt).toContain('HOLY')
  })

  it('non-admin price block drops preview rows but keeps legacy rows', () => {
    const block = buildPricesBlock('2026', false)
    for (const label of ADMIN_ONLY_LABELS) {
      expect(block).not.toContain(label)
    }
    expect(block).toContain('CUTY')
  })

  it('default prompt (no opts) is the admin view for backwards-compat', () => {
    const prompt = buildSystemPrompt('2026')
    expect(prompt).toContain('Sienna One')
  })

  it('Bastian prompt includes Iconix products but not Moonlight/Sienna/Za-Ha', () => {
    const prompt = buildSystemPrompt('2026', { allowedPreviewIds: ICONIX_PREVIEW_COLLECTION_IDS })
    expect(prompt).toContain('Flower Heart')
    expect(prompt).toContain('Riviera Four')
    expect(prompt).toContain('Linea Three')
    expect(prompt).not.toContain('Original Moonlight')
    expect(prompt).not.toContain('Sienna One')
    expect(prompt).not.toContain('Za-Ha')
  })

  it('Bastian price block includes Flower Heart but not Sienna One', () => {
    const block = buildPricesBlock('2026', { allowedPreviewIds: ICONIX_PREVIEW_COLLECTION_IDS })
    expect(block).toContain('Flower Heart')
    expect(block).not.toContain('Sienna One')
    expect(block).not.toContain('Original Moonlight')
  })
})
