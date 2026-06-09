/**
 * GET /api/pack-templates/[id]/download — stream a pack's Excel order template.
 *
 * Self-healing: if the stored object is missing (a brand-new pack, or a
 * generation that once failed), lib/packTemplates regenerates it on the fly.
 * Sets a clean Content-Disposition filename derived from the pack's current
 * label, so downloads never save as a raw UUID.
 *
 * Admin only.
 */

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getUserContext } from '@/app/api/_lib/access'
import { checkRateLimit } from '@/lib/rateLimit'
import { resolvePackTemplate, XLSX_CONTENT_TYPE } from '@/lib/packTemplates'

export const runtime = 'nodejs'

export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'pack-template-download' })
    if (rateLimitRes) return rateLimitRes

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const supabase = await createClient()
    const { user, isAdmin } = await getUserContext(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const admin = createAdminClient()
    const resolved = await resolvePackTemplate(admin, id)
    if (!resolved) return NextResponse.json({ error: 'Pack not found' }, { status: 404 })

    const { buffer, fileName } = resolved
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': XLSX_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[pack-template download] Exception:', err?.message)
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 })
  }
}
