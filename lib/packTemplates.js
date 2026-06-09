/**
 * lib/packTemplates.js — single source of truth for pack order-template files.
 *
 * Used by:
 *   - pack CRUD hooks (app/api/packs/*)            → regenerate / delete
 *   - the download route (app/api/pack-templates)  → resolve bytes (self-heal)
 *   - the Packs folder list                        → listPackTemplates
 *   - the resources email route                    → resolve bytes to attach
 *   - the backfill script                          → regenerate in bulk
 *
 * Every function takes an `admin` Supabase client (service role) so the same
 * code works both inside Next route handlers (createAdminClient()) and in
 * standalone scripts (a plain @supabase/supabase-js client). Storage is a
 * PRIVATE bucket — reads/writes always go through the service role.
 */

import { generatePackExcelBuffer } from './packExcel'

export const PACK_TEMPLATES_BUCKET = 'pack-templates'
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Stable object key: keyed by pack id, so renaming a pack never orphans its
// file (the human-facing filename is derived separately from the label).
export function packTemplateObjectKey(packId) {
  return `${packId}.xlsx`
}

// The app-relative download path served by the API route.
export function packTemplateDownloadPath(packId) {
  return `/api/pack-templates/${packId}/download`
}

// Reverse of packTemplateDownloadPath — pulls the pack id out of a stored
// attachment path (used by Fair Assistant send/validation). Returns null for
// anything that isn't a pack-template download path.
const PACK_TEMPLATE_PATH_RE = /^\/api\/pack-templates\/([0-9a-fA-F-]{36})\/download$/
export function packTemplateIdFromPath(path) {
  const m = PACK_TEMPLATE_PATH_RE.exec(String(path || ''))
  return m ? m[1] : null
}

// Human-facing download filename, derived from the pack's CURRENT label.
export function packTemplateFileName(label) {
  const slug = String(label || 'Pack')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `LoveLab_Order_Template_${slug || 'Pack'}.xlsx`
}

/**
 * Generate the pack's Excel and upsert it into storage.
 * @param {object} admin — service-role Supabase client
 * @param {{id: string, label: string, form_rows: Array}} pack
 */
export async function regeneratePackTemplate(admin, pack) {
  if (!pack?.id) throw new Error('regeneratePackTemplate: pack.id is required')
  const buffer = await generatePackExcelBuffer(pack)
  const { error } = await admin.storage
    .from(PACK_TEMPLATES_BUCKET)
    .upload(packTemplateObjectKey(pack.id), buffer, {
      contentType: XLSX_CONTENT_TYPE,
      upsert: true,
      // Don't let an edge cache serve a stale template after an update.
      cacheControl: '0',
    })
  if (error) throw new Error(`pack template upload failed: ${error.message}`)
  return { ok: true, key: packTemplateObjectKey(pack.id) }
}

/** Remove a pack's stored template (no-op-safe if it never existed). */
export async function deletePackTemplate(admin, packId) {
  if (!packId) throw new Error('deletePackTemplate: packId is required')
  const { error } = await admin.storage
    .from(PACK_TEMPLATES_BUCKET)
    .remove([packTemplateObjectKey(packId)])
  if (error) throw new Error(`pack template delete failed: ${error.message}`)
  return { ok: true }
}

/**
 * Resolve a pack's template bytes for download. Self-healing: if the stored
 * object is missing (generation once failed, or a brand-new pack), it
 * regenerates from the live pack, uploads it best-effort, and returns the
 * bytes anyway. Returns null when the pack doesn't exist.
 *
 * @param {object} admin — service-role Supabase client
 * @param {string} packId
 * @returns {Promise<null | { buffer: Buffer, fileName: string, label: string }>}
 */
export async function resolvePackTemplate(admin, packId) {
  if (!packId) return null
  const { data: pack, error: pErr } = await admin
    .from('packs')
    .select('id, label, form_rows')
    .eq('id', packId)
    .maybeSingle()
  if (pErr) throw new Error(`pack lookup failed: ${pErr.message}`)
  if (!pack) return null

  let buffer = null
  const dl = await admin.storage
    .from(PACK_TEMPLATES_BUCKET)
    .download(packTemplateObjectKey(packId))
  if (!dl.error && dl.data) {
    const ab = await dl.data.arrayBuffer()
    buffer = Buffer.from(ab)
  }

  if (!buffer || buffer.length === 0) {
    buffer = await generatePackExcelBuffer(pack)
    // Best-effort cache write — never block the download on it.
    try {
      await admin.storage
        .from(PACK_TEMPLATES_BUCKET)
        .upload(packTemplateObjectKey(packId), buffer, {
          contentType: XLSX_CONTENT_TYPE,
          upsert: true,
          cacheControl: '0',
        })
    } catch (e) {
      console.warn('[packTemplates] self-heal upload failed:', e?.message)
    }
  }

  return { buffer, fileName: packTemplateFileName(pack.label), label: pack.label }
}

/**
 * List the packs shown in the admin "Packs" folder: global + seed packs only
 * (private agent packs stay private). Ordered seed-first, then chronological —
 * matching GET /api/packs.
 *
 * @param {object} admin — service-role Supabase client
 * @returns {Promise<Array<{ id: string, label: string, fileName: string }>>}
 */
export async function listPackTemplates(admin) {
  const { data, error } = await admin
    .from('packs')
    .select('id, label, scope, is_seed, created_at')
    .eq('scope', 'global')
    .order('is_seed', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`pack list failed: ${error.message}`)
  return (data || []).map((p) => ({
    id: p.id,
    label: p.label,
    fileName: packTemplateFileName(p.label),
  }))
}
