import { getProductType } from './catalog.js'

/**
 * Collection families for the builder's selection grid.
 *
 * The grid used to lay every catalog entry out side by side — 26 cards on the
 * Bracelets tab — which reads as a wall of products rather than a range of
 * them. A range gets ONE card that you open, the way the pack strip opens a
 * fair folder. CUTY, CUBIX, Matchy Fancy and Holy stay a top-level card.
 *
 * Shapy Sparkle Fancy and Shapy Shine Fancy are each one collection, so those
 * folders open onto shapes (Round / Heart / …). G/H was retired. D VVS stays
 * a solo card. `openAsShapes` is what makes a one-SKU folder instead of a tick.
 *
 * This is PRESENTATION ONLY. A selection is still a collection id (or a
 * collection::shape key), lines are still one per pick, and pricing / the
 * order form never see a family.
 *
 * A family sits in the grid at the catalog position of its FIRST member.
 */
export const COLLECTION_FAMILIES = [
  {
    id: 'FAM_MULTI',
    label: 'MULTI',
    memberIds: ['M3', 'M4', 'M5'],
  },
  {
    id: 'FAM_MOONLIGHT',
    label: 'MOONLIGHT',
    memberIds: ['MFM', 'MNO', 'MNH'],
  },
  {
    id: 'FAM_SIENNA',
    label: 'SIENNA',
    memberIds: ['SI1', 'SI2P', 'SI3', 'SI4', 'SI5'],
  },
  {
    // One SKU, many shapes. Opening the card shows Heart / Pear / … instead
    // of exploding six Shine cards onto the root grid.
    id: 'FAM_SHAPY_SHINE',
    label: 'SHAPY SHINE',
    memberIds: ['SSF'],
    openAsShapes: true,
  },
  {
    // Fancy shapes, same gesture as Shine. D VVS is its own card. Necklace
    // SSPF_NECK stays a solo card.
    id: 'FAM_SHAPY_SPARKLE',
    label: 'SHAPY SPARKLE',
    memberIds: ['SSPF'],
    openAsShapes: true,
  },
  {
    // "All the rest" (Sam). Za-Ha leads because the family card takes its
    // catalog position, which lands Iconics last — after Moonlight and Sienna.
    id: 'FAM_ICONICS',
    label: 'ICONICS',
    memberIds: ['ZAHA', 'LUVA', 'LUMA', 'RIV4', 'RIV8', 'LIN3', 'LIN5'],
  },
  {
    id: 'FAM_MULTI_NECK',
    label: 'MULTI NECKLACE',
    memberIds: ['M3_NECK', 'M4_NECK', 'M5_NECK'],
  },
]

const FAMILY_BY_MEMBER_ID = new Map()
for (const family of COLLECTION_FAMILIES) {
  for (const id of family.memberIds) FAMILY_BY_MEMBER_ID.set(id, family)
}

export function familyForCollectionId(collectionId) {
  return FAMILY_BY_MEMBER_ID.get(collectionId) || null
}

export function familyById(familyId) {
  return COLLECTION_FAMILIES.find((f) => f.id === familyId) || null
}

function keepsSingleMemberFolder(family, col) {
  if (!family.openAsShapes) return false
  return Array.isArray(col?.shapes) && col.shapes.length > 1
}

/**
 * Turn a visible collection list into the ordered entries the grid renders.
 *
 * `cols` is expected to be already filtered by access and product type, so a
 * family only ever offers what this user is allowed to sell. Two consequences
 * that matter:
 *   - a family whose members are all hidden produces no entry at all;
 *   - a family down to a SINGLE visible member is flattened back into a plain
 *     collection card, because a folder holding one thing is just a detour —
 *     unless `openAsShapes` is set and that member has more than one shape.
 *
 * Returns entries of either shape:
 *   { type: 'collection', key: <collectionId>, col }
 *   { type: 'family',     key: <familyId>,     family, members: [col, …] }
 */
export function buildGridEntries(cols) {
  const visible = cols || []
  const visibleIds = new Set(visible.map((c) => c.id))
  const entries = []

  // Member order follows the family declaration, not the catalog, so Iconics
  // reads Za-Ha → Linea rather than jumping around.
  const membersOf = (family) => family.memberIds
    .filter((id) => visibleIds.has(id))
    .map((id) => visible.find((c) => c.id === id))

  // A family takes the catalog slot of its first DECLARED member, not of
  // whichever member the catalog happens to list earliest. That distinction is
  // what keeps Iconics last: Za-Ha is declared first, so the card sits after
  // Moonlight and Sienna instead of jumping to an earlier catalog neighbour.
  const anchors = new Map()
  for (const family of COLLECTION_FAMILIES) {
    const members = membersOf(family)
    if (members.length > 0) anchors.set(members[0].id, family)
  }

  for (const col of visible) {
    const family = familyForCollectionId(col.id)
    if (!family) {
      entries.push({ type: 'collection', key: col.id, col })
      continue
    }
    if (anchors.get(col.id) !== family) continue

    const members = membersOf(family)
    if (members.length === 1 && !keepsSingleMemberFolder(family, members[0])) {
      entries.push({ type: 'collection', key: members[0].id, col: members[0] })
    } else {
      entries.push({ type: 'family', key: family.id, family, members })
    }
  }

  return entries
}

/**
 * The product type a family belongs to, derived from its members rather than
 * declared, so a family can never claim a tab none of its members appear on.
 * Returns null for a family with no resolvable members.
 */
export function familyProductType(family, allCollections) {
  for (const id of family.memberIds) {
    const col = (allCollections || []).find((c) => c.id === id)
    if (col) return getProductType(col)
  }
  return null
}
