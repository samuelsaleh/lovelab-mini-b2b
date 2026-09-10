import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';

/**
 * PATCH /api/igi/models — rename a model, or set IGI's alert level.
 *
 * LoveLab decides the name and IGI follow it. There is no "their name / our
 * name" — that split was the original bug, where one row was ML MULTI3 on one
 * side and HALO on the other.
 *
 * Renaming is safe at any time because everything hangs on the serial, never on
 * the name. Nothing in the history moves when this changes.
 */
export async function PATCH(request) {
  const auth = await requireLoveLab(request, 'igi-models-write', 30);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { model_id: modelId, name, pool_min: poolMin } = body || {};

  if (typeof modelId !== 'string' || !modelId) {
    return NextResponse.json({ error: 'A model is required' }, { status: 400 });
  }

  const patch = { updated_at: new Date().toISOString() };

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'A model needs a name' }, { status: 400 });
    }
    patch.name = name.trim().slice(0, 200);
  }

  // IGI's alert level on their own stock. LoveLab can seed it before IGI have
  // logins; once they do, it is theirs to set.
  if (poolMin !== undefined) {
    if (poolMin !== null && (!Number.isInteger(poolMin) || poolMin < 0)) {
      return NextResponse.json(
        { error: 'The alert level must be a whole number, zero or more' },
        { status: 400 },
      );
    }
    patch.pool_min = poolMin;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  }

  try {
    const { data, error } = await auth.adminSupabase
      .from('igi_models')
      .update(patch)
      .eq('id', modelId)
      .select('id, serial, name, pool_min')
      .maybeSingle();

    if (error) return fail('IGI/Models PATCH', error, 'Failed to save the model');
    if (!data) return NextResponse.json({ error: 'Model not found' }, { status: 404 });

    return NextResponse.json({ model: data });
  } catch (err) {
    return fail('IGI/Models PATCH', err, 'Internal server error');
  }
}
