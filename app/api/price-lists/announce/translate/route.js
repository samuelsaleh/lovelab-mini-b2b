import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { translateText } from '@/lib/ai/translateText';
import { isAgentLanguage } from '@/lib/agents/language';
import { MAX_NOTE_LENGTH } from '@/lib/priceListAnnouncement';
import { COLLECTIONS } from '@/lib/catalog';

export const runtime = 'nodejs';

/**
 * POST /api/price-lists/announce/translate
 *
 * Translate the admin's "what changed" note into ONE target language.
 * One language per request: the modal fans out, and each language gets its
 * own retry. A refused translation is a 422 with a readable reason so the
 * admin can write that language by hand; nothing is ever sent unverified.
 * Admin only.
 */
export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'price-list-translate' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  const sourceLang = String(body?.sourceLang || '').trim().toLowerCase();
  const targetLang = String(body?.targetLang || '').trim().toLowerCase();
  const collectionIds = Array.isArray(body?.collectionIds) ? body.collectionIds : [];

  if (!note) return NextResponse.json({ error: 'Note is required' }, { status: 400 });
  if (note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ error: `Note is too long (max ${MAX_NOTE_LENGTH} characters)` }, { status: 400 });
  }
  if (!isAgentLanguage(sourceLang)) return NextResponse.json({ error: 'Invalid source language' }, { status: 400 });
  if (!isAgentLanguage(targetLang)) return NextResponse.json({ error: 'Invalid target language' }, { status: 400 });

  const labels = COLLECTIONS.filter((c) => collectionIds.includes(c.id)).map((c) => c.label);
  const context = labels.length
    ? `A new price list; the collections concerned are ${labels.join(', ')}. Collection names stay exactly as written.`
    : 'A new price list for LoveLab sales agents.';

  const result = await translateText({ text: note, sourceLang, targetLang, context });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, lang: targetLang }, { status: 422 });
  }
  return NextResponse.json({ lang: targetLang, text: result.text, verified: result.verified });
}
