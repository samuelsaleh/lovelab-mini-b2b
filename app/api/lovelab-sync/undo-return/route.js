import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getUserContext } from '@/app/api/_lib/access'
import { undoConsignmentReturnToLovelab } from '@/lib/lovelab-sync'
import { checkRateLimit } from '@/lib/rateLimit'

export async function POST(request) {
  try {
    // Even admins go through this — a stuck loop or a leaked token could
    // otherwise hammer the Lovelab ERP.
    const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'lovelab-undo-return' })
    if (rateLimitRes) return rateLimitRes

    const supabase = await createClient()
    const { user, isAdmin } = await getUserContext(supabase)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { document_id } = body
    if (!document_id) {
      return NextResponse.json({ error: 'document_id is required' }, { status: 400 })
    }

    const adminSupabase = createAdminClient()
    const { data: document, error: fetchErr } = await adminSupabase
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single()

    if (fetchErr || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const result = await undoConsignmentReturnToLovelab(document)
    return NextResponse.json({ ok: true, data: result })
  } catch (err) {
    console.error('[lovelab-sync/undo-return] Error:', err.message)
    return NextResponse.json(
      { error: err.message || 'Failed to undo return in Lovelab ERP' },
      { status: 502 },
    )
  }
}
