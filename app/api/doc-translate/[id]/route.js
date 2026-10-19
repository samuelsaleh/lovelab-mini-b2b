/**
 * GET /api/doc-translate/[id] — status of a translation job (admin, own jobs only).
 * { status: 'queued'|'running' } | { status: 'failed', error }
 * | { status: 'done', url, filename, flags, pages }  (url is a 10-minute signed link)
 */

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getUserContext } from '@/app/api/_lib/access'
import { checkRateLimit } from '@/lib/rateLimit'
import { getJobView } from '@/lib/doc-translate/jobs'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 120, prefix: 'doc-translate-status' })
    if (rateLimitRes) return rateLimitRes

    const supabase = await createClient()
    const { user, isAdmin } = await getUserContext(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { id } = await params
    if (!UUID_RE.test(id || '')) return NextResponse.json({ error: 'Unknown job' }, { status: 404 })

    const view = await getJobView(createAdminClient(), id, user.id)
    if (!view) return NextResponse.json({ error: 'Unknown job' }, { status: 404 })
    return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[doc-translate GET] Exception:', err?.message)
    return NextResponse.json({ error: 'Could not read the job' }, { status: 500 })
  }
}
