/**
 * GET /api/doc-translations — the translated documents, newest first (admin only).
 * { translations: [{ id, name, path, source_path, language, pages, created_at }] }
 * `path` is what the Resources card uses to download the file and to attach it to an email.
 */

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getUserContext } from '@/app/api/_lib/access'
import { checkRateLimit } from '@/lib/rateLimit'
import { listTranslations } from '@/lib/doc-translate/library'

export const runtime = 'nodejs'

export async function GET(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'doc-translations' })
    if (rateLimitRes) return rateLimitRes

    const supabase = await createClient()
    const { user, isAdmin } = await getUserContext(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const translations = await listTranslations(createAdminClient())
    return NextResponse.json({ translations }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[doc-translations GET] Exception:', err?.message)
    return NextResponse.json({ error: 'Could not load the translated documents' }, { status: 500 })
  }
}
