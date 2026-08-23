/**
 * PUT /api/packs/[id]/pinned — pin or unpin a pack for the calling user only.
 *
 * Body: { pinned: boolean }
 *
 * A pinned pack sorts to the front of the Builder strip and stays visible inside
 * every folder, so the everyday packs are always one click away. Like hiding,
 * this is a personal preference and not a permission: writes go through the
 * user-context client with an explicit user_id, so one user can never touch
 * another user's pin list (pack_pinned RLS enforces the same rule).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { setPackPinned, isMissingTableError } from '@/lib/packFairs'

function badRequest(message, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

// The Phase 34 migration hasn't been applied. Distinct from a real failure so
// the UI can say so plainly instead of silently rolling the change back.
function notInstalled() {
  return NextResponse.json(
    { error: 'Pinning packs is not set up in this database yet.', code: 'PACK_FOLDERS_NOT_INSTALLED' },
    { status: 503 },
  )
}

export async function PUT(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'pack-pinned-put' })
    if (rateLimitRes) return rateLimitRes

    const { id } = await params
    if (!id) return badRequest('id is required')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return badRequest('Unauthorized', 401)

    const body = await request.json().catch(() => null)
    if (!body) return badRequest('Invalid JSON body')
    if (typeof body.pinned !== 'boolean') return badRequest('pinned must be a boolean')

    // The pack must be visible to the caller — pinning something you cannot see
    // is meaningless, and it stops a caller probing for foreign pack ids.
    const { data: pack, error: packErr } = await supabase
      .from('packs')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (packErr) {
      console.error('[pack pinned PUT fetch]', packErr.message)
      return badRequest('Failed to load pack', 500)
    }
    if (!pack) return badRequest('Pack not found', 404)

    try {
      await setPackPinned(supabase, id, user.id, body.pinned)
    } catch (err) {
      if (isMissingTableError(err)) return notInstalled()
      throw err
    }

    return NextResponse.json({ ok: true, pinned: body.pinned })
  } catch (err) {
    console.error('[pack pinned PUT] Exception:', err)
    return badRequest('Failed to update pack pin', 500)
  }
}
