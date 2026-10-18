/**
 * POST /api/doc-translate — translate one LoveLab document into another
 * language, keeping the PDF layout identical (admin only).
 *
 * Body: { path: '/BRAND PRESENTATION DOCS/….pdf', language: 'fr' }
 * Response: the translated PDF (application/pdf). X-Translation-Flags is the
 * number of paragraphs that need a human look (did not fit, not translated).
 *
 * The request is validated here (admin, known PDF, supported language), then
 * handed to the extract → translate → render pipeline in lib/doc-translate.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserContext } from '@/app/api/_lib/access'
import { checkRateLimit } from '@/lib/rateLimit'
import { findB2BFileByPath } from '@/lib/b2b-files'
import { TRANSLATION_LANGUAGES } from '@/lib/doc-translate/languages'
import { translateDocument } from '@/lib/doc-translate/engine'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'doc-translate' })
    if (rateLimitRes) return rateLimitRes

    const supabase = await createClient()
    const { user, isAdmin } = await getUserContext(supabase)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const body = await request.json().catch(() => null)
    const file = findB2BFileByPath(body?.path)
    if (!file || !file.path.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Unknown PDF document' }, { status: 400 })
    }
    const language = TRANSLATION_LANGUAGES.find((l) => l.code === body?.language)
    if (!language) return NextResponse.json({ error: 'Unsupported language' }, { status: 400 })

    const result = await translateDocument({ file, language })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 })

    const base = file.name.replace(/\.pdf$/i, '')
    const filename = `${base} — ${language.name}.pdf`
    return new NextResponse(result.pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="translated.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'X-Translation-Flags': String(result.flags.length),
        'X-Translation-Pages': String(result.stats.pages),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[doc-translate POST] Exception:', err?.message)
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 })
  }
}
