/**
 * PUT /api/packs/[id]/hidden — hide or unhide a pack for the calling user only.
 *
 * Body: { hidden: boolean }
 *
 * This is a personal preference, not a permission: it removes the pack from
 * *your* Builder strip and nobody else's. Writes always go through the
 * user-context client with an explicit user_id, so one user can never touch
 * another user's hidden list (pack_hidden RLS enforces the same rule).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { setPackHidden, isMissingTableError } from '@/lib/packFairs'

function badRequest(message, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

// The Phase 34 migration hasn't been applied. Distinct from a real failure so
// the UI can say so plainly instead of silently rolling the change back, which
// looks to the user like the pack un-hiding itself.
function notInstalled() {
  return NextResponse.json(
    { error: 'Pack hiding is not set up in this database yet.', code: 'PACK_FOLDERS_NOT_INSTALLED' },
    { status: 503 },
  )
}

export async function PUT(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'pack-hidden-put' })
    if (rateLimitRes) return rateLimitRes

    const { id } = await params
    if (!id) return badRequest('id is required')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return badRequest('Unauthorized', 401)

    const body = await request.json().catch(() => null)
    if (!body) return badRequest('Invalid JSON body')
    if (typeof body.hidden !== 'boolean') return badRequest('hidden must be a boolean')

    // The pack must be visible to the caller — hiding something you cannot see
    // is meaningless, and it stops a caller probing for foreign pack ids.
    const { data: pack, error: packErr } = await supabase
      .from('packs')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (packErr) {
      console.error('[pack hidden PUT fetch]', packErr.message)
      return badRequest('Failed to load pack', 500)
    }
    if (!pack) return badRequest('Pack not found', 404)

    try {
      await setPackHidden(supabase, id, user.id, body.hidden)
    } catch (err) {
      if (isMissingTableError(err)) return notInstalled()
      throw err
    }

    return NextResponse.json({ ok: true, hidden: body.hidden })
  } catch (err) {
    console.error('[pack hidden PUT] Exception:', err)
    return badRequest('Failed to update pack visibility', 500)
  }
}
