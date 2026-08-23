/**
 * PUT /api/packs/[id]/fairs — file a pack under a set of trade fairs.
 *
 * Body: { event_ids: string[] } — the complete new set (replace, not append).
 * An empty array unfiles the pack from every fair.
 *
 * Open to any signed-in user who can SEE the pack: filing is an organising
 * action shared by the whole team, not a permission grant. It never changes who
 * can see a pack — packs.scope + pack_visibility still decide that.
 */

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { syncPackFairs, findNonFairEventIds, isMissingTableError } from '@/lib/packFairs'

function badRequest(message, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

// The Phase 34 migration hasn't been applied. Distinct from a real failure so
// the UI can say so plainly instead of silently rolling the change back, which
// looks to the user like the pack refusing to stay in the folder.
function notInstalled() {
  return NextResponse.json(
    { error: 'Pack folders are not set up in this database yet.', code: 'PACK_FOLDERS_NOT_INSTALLED' },
    { status: 503 },
  )
}

export async function PUT(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'pack-fairs-put' })
    if (rateLimitRes) return rateLimitRes

    const { id } = await params
    if (!id) return badRequest('id is required')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return badRequest('Unauthorized', 401)

    const body = await request.json().catch(() => null)
    if (!body) return badRequest('Invalid JSON body')
    if (!Array.isArray(body.event_ids)) return badRequest('event_ids must be an array')

    if (body.event_ids.some((v) => typeof v !== 'string' || !v)) {
      return badRequest('event_ids must contain only non-empty strings')
    }
    // Duplicates are tolerated and collapsed — the UI can send a merged list.
    const eventIds = [...new Set(body.event_ids)]

    // The pack must be visible to the caller. Uses the RLS-bearing client so an
    // agent can never file somebody else's private pack.
    const { data: pack, error: packErr } = await supabase
      .from('packs')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (packErr) {
      console.error('[pack fairs PUT fetch]', packErr.message)
      return badRequest('Failed to load pack', 500)
    }
    if (!pack) return badRequest('Pack not found', 404)

    const adminSupabase = createAdminClient()

    const unknown = await findNonFairEventIds(adminSupabase, eventIds)
    if (unknown.length > 0) {
      return badRequest(`Not a fair: ${unknown.join(', ')}`)
    }

    try {
      await syncPackFairs(adminSupabase, id, eventIds, user.id)
    } catch (err) {
      if (isMissingTableError(err)) return notInstalled()
      throw err
    }

    return NextResponse.json({ ok: true, event_ids: eventIds })
  } catch (err) {
    console.error('[pack fairs PUT] Exception:', err)
    return badRequest('Failed to update pack fairs', 500)
  }
}
