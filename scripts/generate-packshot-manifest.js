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

  // Fallback: simple color-only filename (e.g. "black.png", "gold.png")
  // Only apply if no underscores and no hyphens — pure color names
  if (!name.includes('_') && !name.includes('-')) {
    const normalized = normalizeColorName(name)
    if (normalized) return { color: normalized, housing: null, carat: null, cord: null }
  }

  return null
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
    const collectionKey = COLLECTION_MAP[topName]
    if (!collectionKey) {
      console.warn(`Unknown top-level folder: "${topName}", skipping`)
      continue
    }

    const topPath = path.join(PUBLIC_DIR, topDir.name)

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
