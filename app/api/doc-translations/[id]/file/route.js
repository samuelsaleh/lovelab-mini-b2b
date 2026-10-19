/**
 * GET /api/doc-translations/[id]/file — download one translated PDF (admin only).
 */

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getUserContext } from '@/app/api/_lib/access'
import { checkRateLimit } from '@/lib/rateLimit'
import { getTranslatedFile } from '@/lib/doc-translate/library'

export const runtime = 'nodejs'

export async function GET(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'doc-translations-file' })
    if (rateLimitRes) return rateLimitRes

    const supabase = await createClient()
    const { user, isAdmin } = await getUserContext(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { id } = await params
    const file = await getTranslatedFile(createAdminClient(), id)
    if (!file) return NextResponse.json({ error: 'Translated document not found' }, { status: 404 })

    return new NextResponse(file.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="translated.pdf"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[doc-translations file GET] Exception:', err?.message)
    return NextResponse.json({ error: 'Could not download the translated document' }, { status: 500 })
  }
}
