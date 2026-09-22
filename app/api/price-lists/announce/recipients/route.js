import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { loadAnnouncementRecipients, groupRecipientsByLanguage } from '@/lib/priceListRecipients';

export const runtime = 'nodejs';

/**
 * GET /api/price-lists/announce/recipients
 *
 * Who a price list announcement would go to, grouped by language, so the
 * admin sees "12 EN · 5 FR · 3 fall back to English" before writing a word.
 * Admin only.
 */
export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'price-list-recipients' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  try {
    const profiles = await loadAnnouncementRecipients(auth.adminSupabase);
    const grouped = groupRecipientsByLanguage(profiles);
    return NextResponse.json({
      total: grouped.recipients.length,
      byLanguage: grouped.byLanguage,
      counts: grouped.counts,
      fallbackToEnglish: grouped.fallbackToEnglish.length,
      derivedFromCountry: grouped.derivedFromCountry.length,
      missingEmail: grouped.missingEmail,
    });
  } catch (err) {
    console.error('[price-lists/announce/recipients]', err?.message);
    return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 });
  }
}
