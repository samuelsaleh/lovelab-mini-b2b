/**
 * POST /api/doc-translate — translate one LoveLab document into another
 * language, keeping the PDF layout identical (admin only).
 *
 * Body: { path: '/BRAND PRESENTATION DOCS/….pdf', language: 'fr' }
 * Response: 202 { id }. The translation runs in the background (lib/doc-translate/jobs)
 * and GET /api/doc-translate/[id] reports it and, when done, gives the download link.
 *
 * The request is validated here (admin, known PDF, supported language).
 */

import { NextResponse, after } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getUserContext } from '@/app/api/_lib/access'
import { checkRateLimit } from '@/lib/rateLimit'
import { findB2BFileByPath } from '@/lib/b2b-files'
import { TRANSLATION_LANGUAGES } from '@/lib/doc-translate/languages'
import { createJob, runJob, jobsAreBusy } from '@/lib/doc-translate/jobs'

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

    if (jobsAreBusy()) return NextResponse.json({ error: 'Other translations are running. Please try again in a minute.' }, { status: 429 })

    const admin = createAdminClient()
    const id = await createJob(admin, { userId: user.id, file, language })
    // Keeps running after the 202 is sent; the browser polls /api/doc-translate/[id].
    after(() => runJob(admin, { id, userId: user.id, file, language }))
    return NextResponse.json({ id }, { status: 202, headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[doc-translate POST] Exception:', err?.message)
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 })
  }
}
