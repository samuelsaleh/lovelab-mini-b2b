/**
 * GET /api/pack-templates — list the pack order templates shown in the admin
 * "Packs" folder (global + seed packs). Each entry carries the live-label
 * filename and the download URL for its self-healing Excel.
 *
 * Admin only — these are internal B2B order templates with pricing.
 */

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getUserContext } from '@/app/api/_lib/access'
import { checkRateLimit } from '@/lib/rateLimit'
import { listPackTemplates } from '@/lib/packTemplates'

export const runtime = 'nodejs'

export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'pack-templates-get' })
    if (rateLimitRes) return rateLimitRes

    const supabase = await createClient()
    const { user, isAdmin } = await getUserContext(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const admin = createAdminClient()
    const templates = await listPackTemplates(admin)

    return NextResponse.json({
      templates: templates.map((t) => ({
        ...t,
        downloadUrl: `/api/pack-templates/${t.id}/download`,
      })),
    })
  } catch (err) {
    console.error('[pack-templates GET] Exception:', err?.message)
    return NextResponse.json({ error: 'Failed to load pack templates' }, { status: 500 })
  }
}
