import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';

/**
 * The mapping between LoveLab's free-text stock descriptions and the models.
 *
 * GET   — every description the ERP has returned, with its model and its kind.
 * PATCH — link one description to a model, or change how it is classified.
 *
 * A computer cannot know that "IGI 0.05 CERTIFICATE" and LGAJ6529 are the same
 * thing; somebody has to say so. That is what this route is for.
 */
export async function GET(request) {
  const auth = await requireLoveLab(request, 'igi-descriptions');
  if (auth.error) return auth.error;

  try {
    const [descriptions, snapshots] = await Promise.all([
      auth.adminSupabase.from('igi_descriptions')
        .select('id, description, model_id, kind, first_seen_at, last_seen_at')
        .order('description', { ascending: true }),
      auth.adminSupabase.from('igi_shelf_snapshots')
        .select('description, total_pcs, snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(400),
    ]);

    if (descriptions.error) {
      return fail('IGI/Descriptions GET', descriptions.error, 'Failed to load the matching table');
    }
    if (snapshots.error) {
      return fail('IGI/Descriptions GET', snapshots.error, 'Failed to load the matching table');
    }

    // Most recent piece count per description, so the screen can show what each
    // line is actually worth before somebody links it.
    const latest = new Map();
    for (const s of snapshots.data) {
      if (!latest.has(s.description)) latest.set(s.description, s.total_pcs);
    }

    return NextResponse.json({
      descriptions: descriptions.data.map((d) => ({
        ...d,
        total_pcs: latest.get(d.description) ?? null,
      })),
    });
  } catch (err) {
    return fail('IGI/Descriptions GET', err, 'Internal server error');
  }
}

const KINDS = new Set(['certificate', 'packaging', 'in_house', 'ignore']);

export async function PATCH(request) {
  const auth = await requireLoveLab(request, 'igi-descriptions-write', 30);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { description, model_id: modelId, kind } = body || {};

  if (typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ error: 'A description is required' }, { status: 400 });
  }
  if (kind !== undefined && !KINDS.has(kind)) {
    return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
  }
  if (modelId !== undefined && modelId !== null && typeof modelId !== 'string') {
    return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
  }

  // Only a certificate line can belong to a model — the database enforces this
  // too, but rejecting here gives a message somebody can act on.
  const nextKind = kind ?? 'certificate';
  if (modelId && nextKind !== 'certificate') {
    return NextResponse.json(
      { error: 'Only a certificate line can be linked to a model' },
      { status: 400 },
    );
  }

  try {
    const patch = { linked_by: auth.user.id };
    if (kind !== undefined) patch.kind = kind;
    if (modelId !== undefined) patch.model_id = modelId;
    // Classifying a line as anything but a certificate clears any stale link.
    if (kind !== undefined && kind !== 'certificate') patch.model_id = null;

    const { data, error } = await auth.adminSupabase
      .from('igi_descriptions')
      .update(patch)
      .eq('description', description)
      .select('id, description, model_id, kind')
      .maybeSingle();

    if (error) return fail('IGI/Descriptions PATCH', error, 'Failed to save the link');
    if (!data) return NextResponse.json({ error: 'Description not found' }, { status: 404 });

    return NextResponse.json({ description: data });
  } catch (err) {
    return fail('IGI/Descriptions PATCH', err, 'Internal server error');
  }
}
