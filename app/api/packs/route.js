/**
 * /api/packs — list and create custom packs.
 *
 * GET  → returns every pack the caller can see (RLS does the filtering:
 *        global packs for everyone, private packs only for the owner; admins
 *        cannot see other users' private packs).
 *
 * POST → creates a pack. We mirror the database CHECK constraint server-side
 *        (€970 minimum) so the user gets a friendly error instead of a raw
 *        constraint failure, and we force scope = 'private' for non-admins
 *        so an agent can never create a global pack visible to everyone.
 */

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { regeneratePackTemplate } from '@/lib/packTemplates'
import { syncPackVisibility, fetchAgentIdsForPacks } from '@/lib/packVisibility'

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

function validateFormRows(formRows) {
  if (!Array.isArray(formRows) || formRows.length === 0) {
    return 'form_rows must be a non-empty array'
  }
  for (const r of formRows) {
    if (!r || typeof r !== 'object') return 'form_rows entries must be objects'
    if (!r.collection || typeof r.collection !== 'string') return 'each row needs a collection'
  }
  return null
}

export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'packs-get' })
    if (rateLimitRes) return rateLimitRes

    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const { user, isAdmin } = await getCaller(supabase, adminSupabase)
    if (!user) return badRequest('Unauthorized', 401)

    // Use the user-context client so RLS filters rows automatically.
    const { data, error } = await supabase
      .from('packs')
      .select('id, label, description, budget_label, fixed_total, form_rows, scope, created_by, is_seed, created_at, updated_at')
      .order('is_seed', { ascending: false }) // seed packs first to keep the legacy ordering
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[packs GET]', error.message)
      return badRequest('Failed to load packs', 500)
    }

    let packs = data || []

    // Only admins need the per-pack agent assignments (to pre-check the editor
    // checkboxes). We never leak the visibility list to agents. Best-effort —
    // a failure here must not break the pack list.
    if (isAdmin && packs.length > 0) {
      try {
        const map = await fetchAgentIdsForPacks(adminSupabase, packs.map((p) => p.id))
        packs = packs.map((p) => ({ ...p, agent_ids: map[p.id] || [] }))
      } catch (e) {
        console.warn('[packs GET] failed to load pack_visibility:', e?.message)
      }
    }

    return NextResponse.json({ packs })
  } catch (err) {
    console.error('[packs GET] Exception:', err)
    return badRequest('Internal server error', 500)
  }
}

export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'packs-post' })
    if (rateLimitRes) return rateLimitRes

    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const { user, isAdmin } = await getCaller(supabase, adminSupabase)
    if (!user) return badRequest('Unauthorized', 401)

    const body = await request.json().catch(() => null)
    if (!body) return badRequest('Invalid JSON body')

    const {
      label,
      description = [],
      budget_label = null,
      fixed_total,
      form_rows,
      scope: requestedScope,
      agent_ids: requestedAgentIds,
    } = body

    if (!label || typeof label !== 'string' || !label.trim()) {
      return badRequest('label is required')
    }
    if (!isPositiveNumber(fixed_total)) {
      return badRequest('fixed_total must be a positive number')
    }
    if (fixed_total < MIN_PACK_TOTAL) {
      return badRequest(`Pack minimum is €${MIN_PACK_TOTAL}`, 422)
    }
    const formRowsErr = validateFormRows(form_rows)
    if (formRowsErr) return badRequest(formRowsErr)

    // Force scope = 'private' for non-admins so an agent can never publish a
    // global/restricted pack. Admins may choose any of the three scopes.
    // RLS would also reject a bad combo, but we want a clean error.
    let scope = 'private'
    if (isAdmin && ['global', 'private', 'restricted'].includes(requestedScope)) {
      scope = requestedScope
    }
    if (scope === 'restricted' && requestedAgentIds !== undefined && !Array.isArray(requestedAgentIds)) {
      return badRequest('agent_ids must be an array')
    }

    // Use the user-context client so RLS WITH CHECK runs.
    const { data: pack, error } = await supabase
      .from('packs')
      .insert({
        label: label.trim(),
        description: Array.isArray(description) ? description : [],
        budget_label: budget_label || null,
        fixed_total,
        form_rows,
        scope,
        created_by: user.id,
        is_seed: false,
      })
      .select()
      .single()

    if (error) {
      console.error('[packs POST]', error.message)
      // Surface the friendly minimum-price message if the DB CHECK fires
      // due to a race or client-side bypass.
      if (error.message?.toLowerCase().includes('check constraint')) {
        return badRequest(`Pack minimum is €${MIN_PACK_TOTAL}`, 422)
      }
      return badRequest('Failed to create pack', 500)
    }

    // Assign visible agents for restricted packs (best-effort; admins can
    // re-edit the assignment from the pack editor).
    if (scope === 'restricted') {
      try {
        await syncPackVisibility(adminSupabase, pack.id, requestedAgentIds || [])
      } catch (e) {
        console.warn('[packs POST] visibility sync failed:', e?.message)
      }
    }

    // Generate the pack's Excel order template (best-effort — a failure here
    // must not fail pack creation; the download route self-heals if missing).
    try {
      await regeneratePackTemplate(adminSupabase, pack)
    } catch (e) {
      console.warn('[packs POST] template generation failed:', e?.message)
    }

    return NextResponse.json({ pack }, { status: 201 })
  } catch (err) {
    console.error('[packs POST] Exception:', err)
    return badRequest('Internal server error', 500)
  }
}
