/**
 * POST /api/packs/reorder — admin-only permanent reordering of the Builder pack strip.
 *
 * Body: { ordered_ids: string[] } — pack UUIDs in the desired left-to-right order.
 * Writes sort_order = 0..n-1 for every id that exists. Unknown ids are ignored.
 */

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'

function badRequest(message, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'packs-reorder' })
    if (rateLimitRes) return rateLimitRes

    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return badRequest('Unauthorized', 401)

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return badRequest('Forbidden: only admins can reorder packs', 403)
    }

    const body = await request.json().catch(() => null)
    const orderedIds = body?.ordered_ids
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return badRequest('ordered_ids must be a non-empty array')
    }
    // Deduplicate while preserving first-seen order.
    const seen = new Set()
    const ids = []
    for (const id of orderedIds) {
      if (typeof id !== 'string' || !id || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    if (ids.length === 0) return badRequest('ordered_ids must contain at least one id')

    // Write each position. Admin client so seeds / foreign private packs are
    // included (RLS UPDATE now allows admins too, but this stays explicit).
    const results = await Promise.all(
      ids.map((id, index) =>
        adminSupabase
          .from('packs')
          .update({ sort_order: index })
          .eq('id', id)
          .select('id')
          .maybeSingle(),
      ),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      console.error('[packs reorder]', failed.error.message)
      return badRequest('Failed to reorder packs', 500)
    }

    return NextResponse.json({ ok: true, count: ids.length })
  } catch (err) {
    console.error('[packs reorder] Exception:', err)
    return badRequest('Internal server error', 500)
  }
}
