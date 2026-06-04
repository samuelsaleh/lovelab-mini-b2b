#!/usr/bin/env node
/**
 * Scans public/Packshot Folder and outputs lib/packshot-manifest.json
 * Run: node scripts/generate-packshot-manifest.js
 */

const fs = require('fs')
const path = require('path')

const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'Packshot Folder')
const OUTPUT = path.join(__dirname, '..', 'lib', 'packshot-manifest.json')

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const EXCLUDED_FOLDERS = new Set(['Earings', '.DS_Store'])

const MULTI_ALLOWED_COLORS = ['Red', 'Bordeaux', 'Gold', 'Silver Grey', 'Black', 'Navy Blue']

const COLLECTION_MAP = {
  'Cuty':           'CUTY',
  'Cubix':          'CUBIX',
  'Multi':          'MULTI',
  'Matchy':         'MF',
  'Shapy Shine':    'SSF',
  'Shapy Sparkle':  'SSPF',
}

const MULTI_SUB = {
  'Three': 'M3',
  'Four':  'M4',
  'Five':  'M5',
}

// ─── 2026 NEW COLLECTIONS (Moonlight / Sienna / Iconix) ───
// These have an extra "model" sub-folder layer (each model = its own catalog id),
// housing folders that already match the catalog tile labels ("Yellow Gold",
// "Black Matte", ...), and filenames shaped:
//   <Color>_<metal>_<finish>_<carat>ct_<material>[_<setting>]-<id>.png
// Color may contain an underscore (Silver_Grey). Model folder names are matched
// after collapsing internal whitespace (handles the "Original  Moonlight" double
// space).
const NEW_COLLECTION_MODELS = {
  'Moonlight': {
    'Long Moonlight':     'MNO',
    'Original Moonlight':  'MFM',
    'Triply Moonlight':    'MNH',
  },
  'Sienna': {
    'Sienna One':   'SI1',
    'Sienna Two':   'SI2P',
    'Sienna Three': 'SI3',
    'Sienna Four':  'SI4',
    'Sienna Five':  'SI5',
  },
  'Iconix': {
    'Flower Heart':     'LUVA',
    'Flower Marquise':  'LUMA',
    'Linea Three':      'LIN3',
    'Linea Five':       'LIN5',
    'Riviera Four':     'RIV4',
    'Riviera Eight':    'RIV8',
    'Zoha':             'ZAHA',
  },
}

const HOUSING_MAP = {
  'white_gold':  'WG',
  'yellow_gold': 'YG',
  'rose_gold':   'RG',
}

// Normalize color aliases to canonical names
const COLOR_NORMALIZE = {
  'darkblue':    'Navy Blue',
  'dark blue':   'Navy Blue',
  'navy blue':   'Navy Blue',
  'navy_blue':   'Navy Blue',
  'navy':        'Navy Blue',
  'silver':      'Silver Grey',
  'silver grey': 'Silver Grey',
  'silver gray': 'Silver Grey',
  'silver_grey': 'Silver Grey',
  'silver_gray': 'Silver Grey',
  'gold':        'Gold',
  'black':       'Black',
  'red':         'Red',
  'bordeaux':    'Bordeaux',
}

function normalizeColorName(raw) {
  if (!raw) return null
  const lower = raw.toLowerCase().replace(/_/g, ' ').trim()
  if (COLOR_NORMALIZE[lower]) return COLOR_NORMALIZE[lower]
  // Title-case with space replacement
  const spaced = raw.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function parseFilename(filename) {
  // Strip double extension (e.g. Foo.png.png → Foo.png → then parse Foo)
  let name = filename.replace(/\.[^.]+$/, '')
  const innerExt = path.extname(name).toLowerCase()
  if (IMAGE_EXTS.has(innerExt)) {
    name = name.replace(/\.[^.]+$/, '') // strip second extension
  }

  // Full format: Color_housing_caratct_cord-id
  const match = name.match(/^(.+?)_(white_gold|yellow_gold|rose_gold)_(\d+_\d+)ct_(\w+)-/)
  if (match) {
    return {
      color: normalizeColorName(match[1]),
      housing: HOUSING_MAP[match[2]] || match[2],
      carat: match[3].replace('_', '.'),
      cord: match[4],
    }
  }

  // No-carat metal format: Color_housing_cord (e.g. "Black_rose_gold_nylon",
  // "Silver_Grey_white_gold_nylon"). Used by the Multi Three "Attached" set,
  // which dropped the carat + hash suffix. Without this the color can't be
  // parsed and the image is skipped entirely (Multi requires a color).
  const noCarat = name.match(/^(.+?)_(white_gold|yellow_gold|rose_gold)_([a-z]+)$/i)
  if (noCarat) {
    return {
      color: normalizeColorName(noCarat[1]),
      housing: HOUSING_MAP[noCarat[2].toLowerCase()] || noCarat[2],
      carat: null,
      cord: noCarat[3],
    }
  }

  // Fallback: simple color-only filename (e.g. "black.png", "gold.png")
  // Only apply if no underscores and no hyphens — pure color names
  if (!name.includes('_') && !name.includes('-')) {
    const normalized = normalizeColorName(name)
    if (normalized) return { color: normalized, housing: null, carat: null, cord: null }
  }

  return null
}

// Title-case each whitespace-separated word: "yellow gold" -> "Yellow Gold".
function titleCaseWords(s) {
  return s.split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Housing label for the new collections, following the CUTY naming convention:
// the shiny golds are just Yellow / White / Pink (pink = rose gold), and the
// matte finishes append ' Matte'. Gray/Black only ever appear as mattes.
const NEW_HOUSING_METAL = { yellow: 'Yellow', white: 'White', rose: 'Pink', gray: 'Gray', black: 'Black' }
function newHousingLabel(metal, finish) {
  const base = NEW_HOUSING_METAL[metal] || titleCaseWords(metal)
  return finish === 'matte' ? `${base} Matte` : base
}

// Normalize a cord color for the new collections to the EXACT catalog palette
// name. Silk and nylon palettes disagree on the silver-grey casing
// ('Silver grey' vs 'Silver Grey'), so the material drives the casing — this is
// what lets findPackshot's exact-color match succeed instead of falling back.
function normalizeNewColor(raw, material) {
  const lower = (raw || '').toLowerCase().replace(/_/g, ' ').trim()
  const isSilk = material === 'silk'
  if (['silver grey', 'silver gray', 'silver', 'grey', 'gray'].includes(lower)) {
    return isSilk ? 'Silver grey' : 'Silver Grey'
  }
  if (lower === 'gold') return 'Gold'
  if (lower === 'black') return 'Black'
  if (lower === 'bordeaux') return 'Bordeaux'
  if (lower === 'brown') return 'Brown'
  return titleCaseWords(lower)
}

// Parse a new-collection filename. Returns null if it doesn't match.
function parseNewFilename(filename) {
  let name = filename.replace(/\.[^.]+$/, '')
  const m = name.match(/^(.+?)_(yellow|rose|white|gray|black)_(gold|matte)_(\d+_\d+)ct_(nylon|silk)(?:_[a-z]+)?-/i)
  if (!m) return null
  return {
    rawColor: m[1],
    metal: m[2].toLowerCase(),
    finish: m[3].toLowerCase(),
    carat: m[4].replace('_', '.'),
    material: m[5].toLowerCase(),
  }
}

function processNewCollection(collectionId, dirPath, manifest) {
  const images = walkDir(dirPath)
  const processed = []
  for (const imgPath of images) {
    const filename = path.basename(imgPath)
    if (filename === '.DS_Store') continue
    const parsed = parseNewFilename(filename)
    if (!parsed) {
      console.warn(`  Unparsed file (skipped): ${collectionId}/${filename}`)
      continue
    }
    const relativePath = path.relative(path.join(__dirname, '..', 'public'), imgPath)
    const url = '/' + relativePath.split(path.sep).map(encodeURIComponent).join('/')
    // Housing tile label, e.g. "Yellow" / "Black Matte" — matches catalog.
    const housing = newHousingLabel(parsed.metal, parsed.finish)
    const color = normalizeNewColor(parsed.rawColor, parsed.material)
    processed.push({ url, color, housing, carat: parsed.carat })
  }
  if (processed.length > 0) {
    manifest[collectionId] = (manifest[collectionId] || []).concat(processed)
  }
}

function housingFromPath(dirPath) {
  const lower = dirPath.toLowerCase()
  if (lower.includes(' wg') || lower.includes('/wg')) return 'WG'
  if (lower.includes(' yg') || lower.includes('/yg')) return 'YG'
  if (lower.includes(' rg') || lower.includes('/rg')) return 'RG'
  if (lower.includes('white_gold') || lower.includes('white gold')) return 'WG'
  if (lower.includes('yellow_gold') || lower.includes('yellow gold')) return 'YG'
  if (lower.includes('rose_gold') || lower.includes('rose gold')) return 'RG'
  if (lower.includes('mix')) return 'MIX'
  return null
}

function isAllowedMultiColor(color) {
  return MULTI_ALLOWED_COLORS.some(ac => ac.toLowerCase() === color.toLowerCase())
}

function walkDir(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath))
    } else if (entry.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath)
    }
  }
  return results
}

function buildManifest() {
  const manifest = {}

  const topFolders = fs.readdirSync(PUBLIC_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !EXCLUDED_FOLDERS.has(d.name.trim()))

  for (const topDir of topFolders) {
    const topName = topDir.name.trim()
    const topPath = path.join(PUBLIC_DIR, topDir.name)

    // New collections: iterate the per-model sub-folders.
    if (NEW_COLLECTION_MODELS[topName]) {
      const modelMap = NEW_COLLECTION_MODELS[topName]
      const subDirs = fs.readdirSync(topPath, { withFileTypes: true }).filter(d => d.isDirectory())
      for (const sub of subDirs) {
        const modelKey = sub.name.replace(/\s+/g, ' ').trim()
        const id = modelMap[modelKey]
        if (!id) {
          console.warn(`Unknown model folder: "${topName}/${sub.name}", skipping`)
          continue
        }
        processNewCollection(id, path.join(topPath, sub.name), manifest)
      }
      continue
    }

    const collectionKey = COLLECTION_MAP[topName]
    if (!collectionKey) {
      console.warn(`Unknown top-level folder: "${topName}", skipping`)
      continue
    }

    if (collectionKey === 'MULTI') {
      const subDirs = fs.readdirSync(topPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const sub of subDirs) {
        const subName = sub.name.trim()
        const multiId = MULTI_SUB[subName]
        if (!multiId) continue
        processCollection(multiId, path.join(topPath, sub.name), manifest, true)
      }
    } else {
      processCollection(collectionKey, topPath, manifest, false)
    }
  }

  return manifest
}

function processCollection(collectionId, dirPath, manifest, isMulti) {
  const images = walkDir(dirPath)
  const processed = []

  for (const imgPath of images) {
    const filename = path.basename(imgPath)
    if (filename === '.DS_Store') continue

    const relativePath = path.relative(path.join(__dirname, '..', 'public'), imgPath)
    const url = '/' + relativePath.split(path.sep).map(encodeURIComponent).join('/')

    const parsed = parseFilename(filename)
    const relToCollection = path.relative(dirPath, imgPath)
    const dirParts = path.dirname(relToCollection).split(path.sep).map(s => s.trim())

    let color = parsed?.color || null
    // If the folder path explicitly says MIX, trust the path over the filename
    const pathHousing = housingFromPath(path.dirname(imgPath))
    let housing = pathHousing === 'MIX' ? 'MIX' : (parsed?.housing || pathHousing)
    let carat = parsed?.carat || null
    let shape = null
    let subgroup = null

    // Derive shape from path for shape-based collections
    if (['MF', 'SSF', 'SSPF'].includes(collectionId)) {
      shape = dirParts[0] || null
      if (shape === '.') shape = null
    }

    // Derive subgroup for Matchy/Shapy Shine (Bezel/Prong)
    if (['MF', 'SSF'].includes(collectionId) && dirParts.length >= 2) {
      const possibleType = dirParts[1] || ''
      if (/bezel/i.test(possibleType)) subgroup = 'Bezel'
      else if (/prong/i.test(possibleType)) subgroup = 'Prong'
    }

    // Derive subgroup for Multi Three (Attached/Detached)
    if (collectionId === 'M3') {
      const pathStr = relToCollection
      if (/detached/i.test(pathStr)) subgroup = 'Detached'
      else if (/attached/i.test(pathStr)) subgroup = 'Attached'
    }

    // Skip Multi images without a recognized color
    if (isMulti && !color) continue

    // Filter Multi to allowed colors only
    if (isMulti && color && !isAllowedMultiColor(color)) {
      console.log(`  Skipping ${collectionId} color "${color}" (not in allowed list)`)
      continue
    }

    processed.push({
      url,
      color,
      housing,
      carat,
      ...(shape ? { shape } : {}),
      ...(subgroup ? { subgroup } : {}),
    })
  }

  if (processed.length > 0) {
    manifest[collectionId] = processed
  }
}

// Run
const manifest = buildManifest()

const stats = {}
for (const [k, v] of Object.entries(manifest)) {
  stats[k] = v.length
}

fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2))
console.log('Manifest written to', OUTPUT)
console.log('Image counts per collection:', stats)
console.log('Total images:', Object.values(stats).reduce((a, b) => a + b, 0))
