/**
 * Backfill / regenerate the Excel order template for every pack.
 *
 * - Ensures the private `pack-templates` storage bucket exists (idempotent).
 * - Generates one {packId}.xlsx per pack and upserts it.
 *
 * Safe to re-run: bucket creation ignores "already exists", and uploads use
 * upsert so each pack always has exactly one current template.
 *
 *   npx tsx scripts/backfill-pack-templates.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { regeneratePackTemplate, PACK_TEMPLATES_BUCKET } from '../lib/packTemplates'

const env = {}
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// 1. Ensure the private bucket exists.
const { error: bucketErr } = await sb.storage.createBucket(PACK_TEMPLATES_BUCKET, { public: false })
if (bucketErr && !/already exists/i.test(bucketErr.message)) {
  console.error('Bucket create failed:', bucketErr.message)
  process.exit(1)
}
console.log(`Bucket "${PACK_TEMPLATES_BUCKET}" ready.`)

// 2. Generate a template for every pack.
const { data: packs, error } = await sb.from('packs').select('id, label, form_rows')
if (error) {
  console.error('Failed to load packs:', error.message)
  process.exit(1)
}

let ok = 0
let fail = 0
for (const pack of packs) {
  try {
    await regeneratePackTemplate(sb, pack)
    ok++
    console.log(`[OK]   ${pack.label} (${pack.id})`)
  } catch (e) {
    fail++
    console.error(`[FAIL] ${pack.label} (${pack.id}): ${e.message}`)
  }
}

console.log(`\nDone. ${ok} generated, ${fail} failed, ${packs.length} total.`)
process.exit(fail > 0 ? 1 : 0)
