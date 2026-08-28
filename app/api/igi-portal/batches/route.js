import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';

/**
 * POST /api/igi-portal/batches — IGI record a production run.
 *
 * Their stock is the sum of these, never a quantity somebody overwrites, so it
 * stays visible what arrived when and against which order. The database has no
 * update or delete policy for IGI on this table: a mistake is corrected by
 * adding a correcting batch, which keeps the trail.
 */
export async function POST(request) {
  const auth = await requireIgi(request, 'igi-batches', 30);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { model_id: modelId, qty, batch_date: batchDate, reference, note } = body || {};

  if (typeof modelId !== 'string' || !modelId) {
    return NextResponse.json({ error: 'Choose a model.' }, { status: 400 });
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json({ error: 'How many did you make?' }, { status: 400 });
  }
  if (typeof batchDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(batchDate)) {
    return NextResponse.json({ error: 'Give the date they were made.' }, { status: 400 });
  }

  try {
    const { data, error } = await auth.supabase
      .from('igi_batches')
      .insert({
        model_id: modelId,
        qty,
        batch_date: batchDate,
        reference: typeof reference === 'string' ? reference.trim().slice(0, 120) || null : null,
        note: typeof note === 'string' ? note.trim().slice(0, 500) || null : null,
        created_by: auth.user.id,
      })
      .select('id, model_id, qty, batch_date, reference')
      .single();

    if (error) return fail('IGI-Portal/Batches', error, 'Could not save the batch');

    return NextResponse.json({ batch: data }, { status: 201 });
  } catch (err) {
    return fail('IGI-Portal/Batches', err, 'Internal server error');
  }
}
