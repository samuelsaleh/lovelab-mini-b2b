/**
 * GET /api/pack-fairs — list every trade fair, with how many packs are filed
 * under each, for the Builder folder chips and the pack editor checkboxes.
 *
 * Deliberately NOT scoped by event_access (unlike /api/events): pack-to-fair
 * filing is shared org-wide, so every signed-in user must be able to see the
 * folder names even for fairs they were never granted document access to.
 * Only id / name / dates / count are returned — no document data leaks.
 */

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { fetchFairsWithPackCounts } from '@/lib/packFairs'

function badRequest(message, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'pack-fairs-get' })
    if (rateLimitRes) return rateLimitRes

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return badRequest('Unauthorized', 401)

    const adminSupabase = createAdminClient()
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const isAdmin = profile?.role === 'admin'

    const rows = await fetchFairsWithPackCounts(adminSupabase)

    // can_delete mirrors what DELETE /api/events/[id] will actually allow
    // (admin, or the person who created the folder) so the UI only offers a
    // delete that is going to succeed. created_by itself is not returned.
    const fairs = rows.map(({ created_by, ...f }) => ({
      ...f,
      can_delete: isAdmin || created_by === user.id,
    }))

    return NextResponse.json({ fairs })
  } catch (err) {
    console.error('[pack-fairs GET] Exception:', err)
    return badRequest('Failed to load fairs', 500)
  }
}
