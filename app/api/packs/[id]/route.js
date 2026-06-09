/**
 * /api/packs/[id] — update or delete a single pack.
 *
 * PUT    → updates a pack the caller owns (RLS handles authz). The €970
 *          minimum and form_rows shape are re-validated here so we surface
 *          friendly errors rather than raw constraint failures.
 *
 * DELETE → deletes a non-seed pack the caller owns. Seed packs are blocked
 *          server-side AND by the RLS policy.
 */

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { regeneratePackTemplate, deletePackTemplate } from '@/lib/packTemplates'
import { syncPackVisibility } from '@/lib/packVisibility'

const MIN_PACK_TOTAL = 970

async function getCaller(supabase, adminSupabase) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, isAdmin: false }
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return { user, isAdmin: profile?.role === 'admin' }
}

function badRequest(message, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isPositiveNumber(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

export async function PUT(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'packs-put' })
    if (rateLimitRes) return rateLimitRes

    const { id } = await params
    if (!id) return badRequest('id is required')

    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const { user, isAdmin } = await getCaller(supabase, adminSupabase)
    if (!user) return badRequest('Unauthorized', 401)

    const body = await request.json().catch(() => null)
    if (!body) return badRequest('Invalid JSON body')

    const updates = {}

    if (body.label !== undefined) {
      if (typeof body.label !== 'string' || !body.label.trim()) {
        return badRequest('label must be a non-empty string')
      }
      updates.label = body.label.trim()
    }
    if (body.description !== undefined) {
      if (!Array.isArray(body.description)) return badRequest('description must be an array')
      updates.description = body.description
    }
    if (body.budget_label !== undefined) {
      updates.budget_label = body.budget_label || null
    }
    if (body.fixed_total !== undefined) {
      if (!isPositiveNumber(body.fixed_total)) return badRequest('fixed_total must be a positive number')
      if (body.fixed_total < MIN_PACK_TOTAL) {
        return badRequest(`Pack minimum is €${MIN_PACK_TOTAL}`, 422)
      }
      updates.fixed_total = body.fixed_total
    }
    if (body.form_rows !== undefined) {
      if (!Array.isArray(body.form_rows) || body.form_rows.length === 0) {
        return badRequest('form_rows must be a non-empty array')
      }
      updates.form_rows = body.form_rows
    }
    if (body.scope !== undefined) {
      // Only admins can flip a pack to/from global or restricted. Agents are
      // stuck with private packs (RLS would also block this, but we want a
      // friendly 403 instead of an opaque 500).
      if (!isAdmin && body.scope !== 'private') {
        return badRequest('Forbidden: only admins can publish global or restricted packs', 403)
      }
      if (!['global', 'private', 'restricted'].includes(body.scope)) {
        return badRequest("scope must be 'global', 'private' or 'restricted'")
      }
      updates.scope = body.scope
    }

    // agent_ids drives the restricted-pack assignment set. Admin-only.
    let agentIds
    if (body.agent_ids !== undefined) {
      if (!isAdmin) {
        return badRequest('Forbidden: only admins can set pack visibility', 403)
      }
      if (!Array.isArray(body.agent_ids)) {
        return badRequest('agent_ids must be an array')
      }
      agentIds = body.agent_ids
    }

    if (Object.keys(updates).length === 0 && agentIds === undefined) {
      return badRequest('No updates provided')
    }

    let pack
    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from('packs')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('[packs PUT]', error.message)
        if (error.message?.toLowerCase().includes('check constraint')) {
          return badRequest(`Pack minimum is €${MIN_PACK_TOTAL}`, 422)
        }
        // PGRST116 = "no rows returned" → RLS blocked the update (e.g. a
        // non-admin trying to edit a global/seed pack, or a pack the caller
        // doesn't own). Surface a clean 404 instead of an opaque 500.
        if (error.code === 'PGRST116') {
          return badRequest('Pack not found or not editable', 404)
        }
        return badRequest('Failed to update pack', 500)
      }
      if (!data) return badRequest('Pack not found or not editable', 404)
      pack = data
    } else {
      // agent_ids-only change: confirm the pack exists and is visible/editable
      // to the caller (RLS) before touching the assignment set.
      const { data, error } = await supabase
        .from('packs')
        .select('*')
        .eq('id', id)
        .single()
      if (error || !data) {
        return badRequest('Pack not found or not editable', 404)
      }
      pack = data
    }

    // Keep the restricted-pack assignment set in sync.
    //   - agent_ids provided + pack is restricted → replace the set.
    //   - scope moved away from restricted → clear any stale assignments.
    const effectiveScope = updates.scope !== undefined ? updates.scope : pack.scope
    try {
      if (agentIds !== undefined && effectiveScope === 'restricted') {
        await syncPackVisibility(adminSupabase, id, agentIds)
        pack = { ...pack, agent_ids: [...new Set(agentIds.filter(Boolean))] }
      } else if (updates.scope !== undefined && updates.scope !== 'restricted') {
        await syncPackVisibility(adminSupabase, id, [])
        pack = { ...pack, agent_ids: [] }
      }
    } catch (e) {
      console.warn('[packs PUT] visibility sync failed:', e?.message)
    }

    // Regenerate the pack's Excel order template so the Packs folder reflects
    // the latest contents (best-effort; the download route self-heals if this
    // fails or never ran). Skip when only the visibility set changed.
    if (Object.keys(updates).length > 0) {
      try {
        await regeneratePackTemplate(adminSupabase, pack)
      } catch (e) {
        console.warn('[packs PUT] template regeneration failed:', e?.message)
      }
    }

    return NextResponse.json({ pack })
  } catch (err) {
    console.error('[packs PUT] Exception:', err)
    return badRequest('Internal server error', 500)
  }
}

export async function DELETE(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'packs-delete' })
    if (rateLimitRes) return rateLimitRes

    const { id } = await params
    if (!id) return badRequest('id is required')

    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const { user } = await getCaller(supabase, adminSupabase)
    if (!user) return badRequest('Unauthorized', 401)

    // Seed packs are undeletable. We check this server-side before the
    // delete so the user gets a clear 422 instead of a silent no-op (the RLS
    // delete policy also filters them out, but it returns 0 rows rather
    // than an error).
    const { data: existing, error: fetchErr } = await adminSupabase
      .from('packs')
      .select('id, is_seed')
      .eq('id', id)
      .maybeSingle()
    if (fetchErr) {
      console.error('[packs DELETE fetch]', fetchErr.message)
      return badRequest('Failed to fetch pack', 500)
    }
    if (!existing) return badRequest('Pack not found', 404)
    if (existing.is_seed) {
      return badRequest('Seed packs cannot be deleted', 422)
    }

    const { error } = await supabase
      .from('packs')
      .delete()
      .eq('id', id)
      .select()
      .single()

    if (error) {
      // PGRST116 = "no rows returned" → caller didn't have permission via RLS.
      if (error.code === 'PGRST116') {
        return badRequest('Forbidden', 403)
      }
      console.error('[packs DELETE]', error.message)
      return badRequest('Failed to delete pack', 500)
    }

    // Remove the pack's stored Excel template (best-effort).
    try {
      await deletePackTemplate(adminSupabase, id)
    } catch (e) {
      console.warn('[packs DELETE] template removal failed:', e?.message)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[packs DELETE] Exception:', err)
    return badRequest('Internal server error', 500)
  }
}
