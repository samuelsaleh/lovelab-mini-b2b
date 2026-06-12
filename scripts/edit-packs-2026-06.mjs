/**
 * One-off (idempotent) pack line-item edits — June 2026.
 *
 * Applies mom's requested changes to three live packs and regenerates their
 * Excel order templates:
 *
 *   Pack 1 (CUTY/CUBIX/MULTI THREE) — add the missing CUTY 0.05 White-housing
 *     nylon colours (so the 0.05 set is complete).
 *   Pack 2 (Shapy Shine 0.10 + Multi Five/Four) — Multi Five 0.50 Black:
 *     housing Yellow -> White.
 *   Pack 3 (Shapy Shine 0.30/0.50 + Matchy) — four swaps (see CHANGES below).
 *
 * Rows are matched by VALUE (not blind index) so the script is safe to re-run:
 * once a change is applied the old value no longer matches and it becomes a
 * no-op.
 *
 *   node scripts/edit-packs-2026-06.mjs --dry-run   # preview, no writes
 *   node scripts/edit-packs-2026-06.mjs             # apply + regenerate xlsx
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { regeneratePackTemplate } from '../lib/packTemplates.js'
import { totalForFormRows, summarizeFormRows } from '../lib/packBuild.js'

const DRY_RUN = process.argv.includes('--dry-run')

// ── env + service-role client (mirrors backfill-pack-templates.mjs) ──────────
const env = {}
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const PACK_1 = '5c19401c-cf24-4d56-8387-099bbbd538d4'
const PACK_2 = '17b56a80-13d7-45f2-88f4-434441567c15'
const PACK_3 = 'dc00fabd-5716-4f63-976a-78831987e9be'

// Missing CUTY 0.05 White nylon colours to add so the set totals 20.
// Ivory is intentionally excluded: it is visually all-but-identical to White
// (#FCF8ED vs #FFFFFF), which is already in the set, and mom wants 20 not 21.
const PACK1_NEW_COLORS = [
  'Fluo Pink', 'Orange', 'Yellow', 'Fluo Yellow', 'Green', 'Turquoise',
  'Light Blue', 'Royal Blue', 'Purple', 'Brown',
]
// CUTY 0.05 White cord colours to remove if present (cleanup for re-runs:
// an earlier pass added Ivory before mom asked for exactly 20).
const PACK1_REMOVE_COLORS = ['Ivory']

const norm = (v) => String(v ?? '').trim().toLowerCase()

// ── Per-pack transforms. Each returns { rows, changes: string[] } ────────────

function editPack1(rows) {
  const changes = []
  const isCuty05White = (r) =>
    norm(r.collection) === 'cuty' && norm(r.carat) === '0.05' && norm(r.bpColor) === 'white'
  const removeSet = new Set(PACK1_REMOVE_COLORS.map(norm))

  // Template = an existing CUTY 0.05 White row (keep all its non-colour fields).
  const template = rows.find(isCuty05White)
  if (!template) throw new Error('Pack 1: no CUTY 0.05 White template row found')

  // 1) Drop unwanted colours (e.g. Ivory) from the CUTY 0.05 White block.
  let working = rows.filter((r) => !(isCuty05White(r) && removeSet.has(norm(r.colorCord))))
  const removed = rows.length - working.length
  if (removed > 0) changes.push(`Pack 1: removed ${removed} CUTY 0.05 White row(s): ${PACK1_REMOVE_COLORS.join(', ')}`)

  // 2) Add any still-missing target colours.
  const existing = new Set(working.filter(isCuty05White).map((r) => norm(r.colorCord)))
  const toAdd = PACK1_NEW_COLORS.filter((c) => !existing.has(norm(c)))
  if (toAdd.length > 0) {
    const newRows = toAdd.map((color) => ({ ...template, colorCord: color }))
    let lastIdx = -1
    working.forEach((r, i) => { if (isCuty05White(r)) lastIdx = i })
    working = [...working.slice(0, lastIdx + 1), ...newRows, ...working.slice(lastIdx + 1)]
    changes.push(`Pack 1: added ${toAdd.length} CUTY 0.05 White rows: ${toAdd.join(', ')}`)
  }

  if (changes.length === 0) changes.push('Pack 1: already correct (no-op)')
  return { rows: working, changes }
}

function editPack2(rows) {
  const changes = []
  const out = rows.map((r) => {
    if (
      norm(r.collection) === 'multi five' &&
      norm(r.carat) === '0.50' &&
      norm(r.colorCord) === 'black' &&
      norm(r.bpColor) === 'yellow'
    ) {
      changes.push('Pack 2: Multi Five 0.50 Black — housing Yellow -> White')
      return { ...r, bpColor: 'White' }
    }
    return r
  })
  if (changes.length === 0) changes.push('Pack 2: target row not found / already White (no-op)')
  return { rows: out, changes }
}

function editPack3(rows) {
  const changes = []
  const out = rows.map((r) => {
    const c = norm(r.collection)
    const shape = norm(r.shape)
    const carat = norm(r.carat)
    const setting = norm(r.setting)
    const cord = norm(r.colorCord)
    const housing = norm(r.bpColor)

    // #1 Shapy Shine Marquise 0.30 Prong: cord Red -> Ivory
    if (c === 'shapy shine fancy' && shape === 'marquise' && carat === '0.30' && setting === 'prong' && cord === 'red') {
      changes.push('Pack 3 #1: Shapy Shine Marquise 0.30 — cord Red -> Ivory')
      return { ...r, colorCord: 'Ivory' }
    }
    // #2 Shapy Shine Pear 0.30 Prong: cord Bordeaux -> Red
    if (c === 'shapy shine fancy' && shape === 'pear' && carat === '0.30' && setting === 'prong' && cord === 'bordeaux') {
      changes.push('Pack 3 #2: Shapy Shine Pear 0.30 — cord Bordeaux -> Red')
      return { ...r, colorCord: 'Red' }
    }
    // #4 Shapy Shine Emerald 0.50 Bezel: cord Black/White housing -> Bordeaux/Yellow
    if (c === 'shapy shine fancy' && shape === 'emerald' && carat === '0.50' && setting === 'bezel' && cord === 'black' && housing === 'white') {
      changes.push('Pack 3 #4: Shapy Shine Emerald 0.50 — cord Black->Bordeaux, housing White->Yellow')
      return { ...r, colorCord: 'Bordeaux', bpColor: 'Yellow' }
    }
    // #8 Matchy Emerald 0.60 Prong: housing -> YY (cord Black unchanged)
    if (c === 'matchy fancy' && shape === 'emerald' && carat === '0.60' && setting === 'prong' && housing !== 'yy') {
      changes.push(`Pack 3 #8: Matchy Emerald 0.60 — housing ${r.bpColor || '(empty)'} -> YY`)
      return { ...r, bpColor: 'YY' }
    }
    return r
  })
  if (changes.length === 0) changes.push('Pack 3: no matching rows (all no-op)')
  return { rows: out, changes }
}

const EDITS = [
  { id: PACK_1, fn: editPack1 },
  { id: PACK_2, fn: editPack2 },
  { id: PACK_3, fn: editPack3 },
]

// ── Run ──────────────────────────────────────────────────────────────────────
let failed = false
for (const { id, fn } of EDITS) {
  const { data: pack, error } = await sb
    .from('packs')
    .select('id, label, form_rows, fixed_total, budget_label')
    .eq('id', id)
    .maybeSingle()
  if (error || !pack) {
    console.error(`[FAIL] load ${id}: ${error?.message || 'not found'}`)
    failed = true
    continue
  }

  const before = Array.isArray(pack.form_rows) ? pack.form_rows : []
  const { rows: after, changes } = fn(before.map((r) => ({ ...r })))

  const newTotal = totalForFormRows(after)
  const summary = summarizeFormRows(after)

  console.log(`\n=== ${pack.label} (${id})`)
  console.log(`rows: ${before.length} -> ${after.length} | fixed_total: ${pack.fixed_total} -> ${newTotal}`)
  for (const ch of changes) console.log('  • ' + ch)

  if (DRY_RUN) {
    console.log('  [dry-run] not writing')
    continue
  }

  const { error: upErr } = await sb
    .from('packs')
    .update({ form_rows: after, fixed_total: newTotal, budget_label: summary.budgetLabel || pack.budget_label })
    .eq('id', id)
  if (upErr) {
    console.error(`[FAIL] update ${pack.label}: ${upErr.message}`)
    failed = true
    continue
  }

  try {
    await regeneratePackTemplate(sb, { id, label: pack.label, form_rows: after })
    console.log(`  [OK] updated + template regenerated`)
  } catch (e) {
    console.error(`[FAIL] regenerate template ${pack.label}: ${e.message}`)
    failed = true
  }
}

console.log(DRY_RUN ? '\nDry run complete.' : '\nDone.')
process.exit(failed ? 1 : 0)
