import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { requireFairAdmin } from '@/lib/fair-assistant/server'
import { buildHousingStock } from '@/lib/housingColorStock'

export const runtime = 'nodejs'

const PAGE = 500
const MAX_PAGES = 40

/**
 * GET /api/analytics/housing-stock
 *
 * Housing colours available, derived from the orders (Sam, 23 Sep 2026):
 * internal (Antwerp Office) orders bring stock in, B2B and B2C sales take
 * it out. Computed here, not in the browser, because internal orders are
 * admin-only and the dashboard is also shown to agents.
 */
export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'analytics-housing-stock' })
  if (rateLimitRes) return rateLimitRes

  const auth = await requireFairAdmin()
  if (auth.error) return auth.error

  try {
    const docs = []
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE
      const { data, error } = await auth.adminSupabase
        .from('documents')
        .select('order_channel, status, deleted_at, metadata')
        .eq('status', 'sent')
        .is('deleted_at', null)
        .in('order_channel', ['internal', 'b2b', 'b2c'])
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      const batch = Array.isArray(data) ? data : []
      docs.push(...batch)
      if (batch.length < PAGE) break
    }
    return NextResponse.json({ rows: buildHousingStock(docs), computedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[analytics/housing-stock]', err?.message)
    return NextResponse.json({ error: 'Failed to compute housing stock' }, { status: 500 })
  }
}
