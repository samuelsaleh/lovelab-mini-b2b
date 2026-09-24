/**
 * GET /api/cron/igi-mail — the scheduled certificate emails, on Antwerp time.
 *
 * The server's crontab calls this once an hour (docs/CERTIFICATE_ERP_SYNC.md
 * has the line). The route reads the clock in Europe/Brussels, so summer and
 * winter time need no thought, and decides what is due:
 *
 *   07:00 every day      → Liuba's "go collect"        (runMorningDigest)
 *   14:00 on a Friday    → IGI's "what LoveLab need"   (runIgiWeekly)
 *   14:00 on an even ISO week's Friday → Alberto's "order at IGI" (runOrderDigest)
 *
 * Any other hour answers { skipped: true }. Each runner sends at most once a
 * day (igi_digest_sends), so calling this more often is harmless.
 *
 * ?force=morning|weekly|order runs one digest now regardless of the clock,
 * for a test from localhost. Still behind the secret, still once a day.
 *
 * Authenticates like /api/cron/igi-stock: the x-vercel-cron-secret header.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { recordHealthEvent } from '@/lib/healthEvent';
import { runMorningDigest, runIgiWeekly, runOrderDigest } from '@/lib/igi/runDigests';

function verifyCronAuth(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron igi-mail] CRON_SECRET env var is not set — all requests rejected.');
    return false;
  }
  return request.headers.get('x-vercel-cron-secret') === cronSecret;
}

/** Hour, weekday and ISO week of a moment, in Antwerp. */
export function brusselsClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels', hour: '2-digit', hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hour = Number(get('hour')) % 24;
  const weekday = get('weekday');
  // ISO week from the local date, so the fortnight flips at Antwerp midnight.
  const local = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
  const day = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(local.getUTCFullYear(), 0, 1);
  const isoWeek = Math.ceil(((local - yearStart) / 86400000 + 1) / 7);
  return { hour, weekday, isoWeek };
}

/** Which digests are due at this moment. */
export function dueNow(now = new Date()) {
  const { hour, weekday, isoWeek } = brusselsClock(now);
  const due = [];
  if (hour === 7) due.push('morning');
  if (weekday === 'Fri' && hour === 14) {
    due.push('weekly');
    if (isoWeek % 2 === 0) due.push('order');
  }
  return due;
}

const RUNNERS = { morning: runMorningDigest, weekly: runIgiWeekly, order: runOrderDigest };

export async function GET(request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get('force');
  const due = force ? (RUNNERS[force] ? [force] : []) : dueNow();
  if (force && !due.length) {
    return NextResponse.json({ error: 'force must be morning, weekly or order' }, { status: 400 });
  }
  if (!due.length) {
    return NextResponse.json({ skipped: true, clock: brusselsClock() });
  }

  const adminSupabase = createAdminClient();
  const results = {};
  for (const kind of due) {
    try {
      results[kind] = await RUNNERS[kind](adminSupabase);
    } catch (err) {
      results[kind] = { sent: false, reason: 'error', error: err?.message || 'unknown' };
      await recordHealthEvent({
        source: 'cron_igi_mail',
        severity: 'error',
        message: `Scheduled certificate email (${kind}) failed: ${err?.message || 'unknown'}`,
        context: { kind },
      });
    }
  }
  return NextResponse.json({ ran: due, results, clock: brusselsClock() });
}
