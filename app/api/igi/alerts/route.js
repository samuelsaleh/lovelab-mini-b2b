import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';

/**
 * PATCH /api/igi/alerts
 *
 * Sets LoveLab's alert level on their own shelf — below it means go collect,
 * because IGI already holds them. Plain numbers only; there is deliberately no
 * "weeks of cover" or any other derived forecast.
 *
 * Accepts one model or a list, which is what the "set for all shown" control
 * on the stock screen sends.
 *
 * IGI's own level (pool_min) is theirs to set and is not writable here.
 */
export async function PATCH(request) {
  const auth = await requireLoveLab(request, 'igi-alerts', 30);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { model_ids: modelIds, shelf_min: shelfMin } = body || {};

  if (!Array.isArray(modelIds) || modelIds.length === 0) {
    return NextResponse.json({ error: 'At least one model is required' }, { status: 400 });
  }
  if (modelIds.length > 200) {
    return NextResponse.json({ error: 'Too many models in one request' }, { status: 400 });
  }
  if (!modelIds.every((id) => typeof id === 'string' && id)) {
    return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
  }
  if (!Number.isInteger(shelfMin) || shelfMin < 0) {
    return NextResponse.json(
      { error: 'The alert level must be a whole number, zero or more' },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await auth.adminSupabase
      .from('igi_models')
      .update({ shelf_min: shelfMin, updated_at: new Date().toISOString() })
      .in('id', modelIds)
      .select('id, shelf_min');

    if (error) return fail('IGI/Alerts PATCH', error, 'Failed to save the alert level');

    return NextResponse.json({ updated: data || [] });
  } catch (err) {
    return fail('IGI/Alerts PATCH', err, 'Internal server error');
  }
}
