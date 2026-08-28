import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';

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

  const { model_ids: modelIds, pool_min: poolMin } = body || {};

  if (!Array.isArray(modelIds) || modelIds.length === 0) {
    return NextResponse.json({ error: 'Choose at least one model.' }, { status: 400 });
  }
  if (modelIds.length > 200) {
    return NextResponse.json({ error: 'That is too many models at once.' }, { status: 400 });
  }
  if (poolMin !== null && (!Number.isInteger(poolMin) || poolMin < 0)) {
    return NextResponse.json(
      { error: 'The level must be a whole number, zero or more.' },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await auth.supabase
      .from('igi_models')
      .update({ pool_min: poolMin })
      .in('id', modelIds)
      .select('id, pool_min');

    if (error) return fail('IGI-Portal/Alerts', error, 'Could not save the level');

    return NextResponse.json({ updated: data || [] });
  } catch (err) {
    return fail('IGI-Portal/Alerts', err, 'Internal server error');
  }
}
