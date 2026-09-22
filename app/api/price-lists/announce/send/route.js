import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { sendEmail } from '@/lib/send-email';
import { recordSend } from '@/lib/emailDeliveries';
import { recordHealthEvent } from '@/lib/healthEvent';
import { publicAssetUrl } from '@/lib/publicAssetHref';
import { PRICE_LIST_FILES } from '@/lib/b2b-files';
import { COLLECTIONS } from '@/lib/catalog';
import { isAgentLanguage } from '@/lib/agents/language';
import { mapPoolWithDeadline } from '@/lib/mapPoolWithDeadline';
import { loadAnnouncementRecipients, describeRecipient } from '@/lib/priceListRecipients';
import { priceListAnnouncementEmail, firstNameOf, MAX_NOTE_LENGTH } from '@/lib/priceListAnnouncement';

export const runtime = 'nodejs';

// Time-boxed loop (see lib/mapPoolWithDeadline.js): the route returns
// `remaining` and the modal calls again until the queue is drained.
//
// Resend allows 2 requests per second. The fair send at 8 in flight got
// HTTP 429 on 9 Sept 2026 and a third of the German drafts failed. Two
// workers, each waiting out a full second per email, stays at that limit;
// a hundred agents is under a minute across a few calls.
const CONCURRENCY = 2;
const MIN_MS_PER_SEND = process.env.NODE_ENV === 'test' ? 0 : 1000;
const TIME_BUDGET_MS = 8500;
const MAX_RECIPIENTS = 500;
const REPLY_TO = 'alberto@love-lab.com';

function badRequest(error) {
  return NextResponse.json({ error }, { status: 400 });
}

function normaliseNotes(raw) {
  const notes = {};
  if (!raw || typeof raw !== 'object') return notes;
  for (const [lang, text] of Object.entries(raw)) {
    if (!isAgentLanguage(lang)) continue;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (trimmed) notes[lang] = trimmed;
  }
  return notes;
}

/**
 * POST /api/price-lists/announce/send
 *
 * Email the chosen price list to the agents in `recipientIds`, each in their
 * own language, with the PDF attached. The client owns the id list: it
 * loops on `remaining` and re-posts only the failed ids, so nobody who was
 * already sent is ever touched again.
 *
 * `testToSelf: true` (or `testTo` equal to the caller's own address) sends
 * a single copy to the admin instead, so they see the real email with the
 * attachment before broadcasting.
 * Admin only.
 */
export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'price-list-send' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));

  const file = PRICE_LIST_FILES.find((f) => f.path === body?.filePath);
  if (!file) return badRequest('Pick one of the price list PDFs');

  const allCollections = body?.allCollections === true;
  const collectionIds = Array.isArray(body?.collectionIds) ? body.collectionIds.map(String) : [];
  const collections = allCollections ? [] : COLLECTIONS.filter((c) => collectionIds.includes(c.id));
  if (!allCollections) {
    if (collectionIds.length === 0) return badRequest('Pick at least one collection, or all collections');
    if (collections.length !== new Set(collectionIds).size) return badRequest('Unknown collection');
  }
  const collectionLabels = collections.map((c) => c.label);

  const notes = normaliseNotes(body?.notes);
  if (Object.keys(notes).length === 0) return badRequest('Write what changed, in at least one language');
  // Every agent also receives the English version below their own.
  if (!notes.en) return badRequest('The English text is required: every agent receives it as a second version');
  for (const text of Object.values(notes)) {
    if (text.length > MAX_NOTE_LENGTH) return badRequest(`Note is too long (max ${MAX_NOTE_LENGTH} characters)`);
  }

  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || siteOrigin;

  // ── Test copy to the admin themself ────────────────────────────────────
  const own = String(auth.user?.email || '').trim().toLowerCase();
  const testTo = body?.testToSelf === true
    ? own
    : (typeof body?.testTo === 'string' ? body.testTo.trim().toLowerCase() : '');
  if (body?.testToSelf === true || testTo) {
    if (!own || testTo !== own) return badRequest('A test copy can only go to your own address');
    const testLang = isAgentLanguage(body?.testLang) && notes[body.testLang] ? body.testLang : Object.keys(notes)[0];

    const pdf = await fetchPdf(siteOrigin, file);
    if (!pdf.ok) return NextResponse.json({ error: pdf.error }, { status: 502 });

    const { subject, html } = priceListAnnouncementEmail({
      lang: testLang,
      firstName: firstNameOf(auth.user?.user_metadata?.full_name || ''),
      note: notes[testLang],
      englishNote: notes.en,
      collectionLabels,
      allCollections,
      fileName: file.name,
    }, siteUrl);

    const result = await sendEmail({
      to: testTo,
      subject: `[TEST] ${subject}`,
      html,
      replyTo: REPLY_TO,
      attachments: [{ filename: file.name, content: pdf.buffer }],
    });
    if (!result.sent) {
      return NextResponse.json({ error: `Test copy not sent (${result.reason || 'unknown'})` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, test: true, to: testTo, lang: testLang, message_id: result.message_id || null });
  }

  // ── Broadcast ──────────────────────────────────────────────────────────
  const recipientIds = Array.isArray(body?.recipientIds)
    ? [...new Set(body.recipientIds.filter((id) => typeof id === 'string' && id))]
    : [];
  if (recipientIds.length === 0) return badRequest('No recipients');
  if (recipientIds.length > MAX_RECIPIENTS) return badRequest(`Too many recipients (max ${MAX_RECIPIENTS})`);

  let eligible;
  try {
    eligible = await loadAnnouncementRecipients(auth.adminSupabase);
  } catch (err) {
    console.error('[price-lists/announce/send] recipients:', err?.message);
    return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 });
  }
  const eligibleById = new Map(eligible.map((p) => [p.id, describeRecipient(p)]));

  const results = [];
  const queue = [];
  for (const id of recipientIds) {
    const r = eligibleById.get(id);
    if (!r) { results.push({ id, status: 'skipped', reason: 'not_eligible' }); continue; }
    if (!r.email) { results.push({ id, name: r.name, status: 'skipped', reason: 'no_email' }); continue; }
    if (!notes[r.language]) {
      // Never send the wrong language: same rule as the fair assistant.
      results.push({ id, email: r.email, name: r.name, lang: r.language, status: 'skipped', reason: 'no_note_for_language' });
      continue;
    }
    queue.push(r);
  }

  if (queue.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, skipped: results.length, remaining: [], results });
  }

  // The PDF once, before any send: a missing file must fail the whole call,
  // not half the agents.
  const pdf = await fetchPdf(siteOrigin, file);
  if (!pdf.ok) return NextResponse.json({ error: pdf.error }, { status: 502 });
  const attachments = [{ filename: file.name, content: pdf.buffer.toString('base64') }];

  const deadlineAt = Date.now() + TIME_BUDGET_MS;
  const outcomes = await mapPoolWithDeadline(queue, CONCURRENCY, deadlineAt, async (r) => {
    const startedAt = Date.now();
    const outcome = await sendOne(r);
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_MS_PER_SEND) await new Promise((res) => setTimeout(res, MIN_MS_PER_SEND - elapsed));
    return outcome;
  });

  async function sendOne(r) {
    const { subject, html } = priceListAnnouncementEmail({
      lang: r.language,
      firstName: firstNameOf(r.name),
      note: notes[r.language],
      englishNote: notes.en,
      collectionLabels,
      allCollections,
      fileName: file.name,
    }, siteUrl);

    const result = await sendEmail({ to: r.email, subject, html, replyTo: REPLY_TO, attachments });
    if (result.sent) {
      await recordSend(auth.adminSupabase, {
        resendId: result.message_id,
        kind: 'price_list_announcement',
        recipient: r.email,
        subject,
      });
      return { id: r.id, email: r.email, name: r.name, lang: r.language, status: 'sent', message_id: result.message_id || null };
    }
    return {
      id: r.id, email: r.email, name: r.name, lang: r.language, status: 'failed',
      reason: result.reason || 'unknown', detail: result.status ? `HTTP ${result.status}` : (result.error || null),
    };
  }

  const remaining = [];
  let sent = 0;
  let failed = 0;
  outcomes.forEach((o, i) => {
    if (!o) { remaining.push(queue[i].id); return; }
    results.push(o);
    if (o.status === 'sent') sent += 1;
    else failed += 1;
  });
  const skipped = results.filter((r) => r.status === 'skipped').length;

  // One audit line per call; the delivery rows carry the per-agent detail.
  await recordHealthEvent({
    source: 'price_list_announcement',
    severity: failed > 0 ? 'warn' : 'info',
    message: `${file.name} announced: ${sent} sent, ${failed} failed, ${skipped} skipped, ${remaining.length} remaining`,
    context: {
      filePath: file.path,
      collectionIds: allCollections ? 'all' : collectionIds,
      languages: Object.keys(notes),
      by: auth.user?.email || auth.user?.id || null,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, sent, failed, skipped, remaining, results });
}

async function fetchPdf(siteOrigin, file) {
  // Fetched over HTTP, never fs.readFile: reading public/ from a function
  // makes Vercel trace the whole folder into the bundle (see
  // app/api/resources/send-email/route.js).
  try {
    const res = await fetch(publicAssetUrl(siteOrigin, file.path));
    if (!res.ok) return { ok: false, error: `Price list not found: ${file.name}` };
    return { ok: true, buffer: Buffer.from(await res.arrayBuffer()) };
  } catch (err) {
    return { ok: false, error: `Could not fetch ${file.name}: ${err?.message || 'network error'}` };
  }
}
