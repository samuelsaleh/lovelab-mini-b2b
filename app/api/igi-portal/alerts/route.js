import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { setPoolMin } from '@/lib/igi/portalActions';

/**
 * PATCH /api/igi-portal/alerts — IGI's own alert level, on their own stock.
 *
 * Two alert rules, one owner each. This one is IGI's: below it means produce
 * more. LoveLab's level on their own shelf is not writable here, and is not
 * even readable — the column is withheld by grant.
 */
export async function PATCH(request) {
  const auth = await requireIgi(request, 'igi-alerts', 30);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await setPoolMin(auth.supabase, auth.user.id, body);
    if (result.error) return fail('IGI-Portal/Alerts', result.error, result.message);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return fail('IGI-Portal/Alerts', err, 'Internal server error');
  }
}
