import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { PORTAL_VIEWS } from '@/lib/igi/portalViews';

/**
 * GET /api/igi/preview/[screen] — IGI's own screens, served to a LoveLab admin.
 *
 * This is what lets Sam open /igi and see the portal itself rather than a
 * description of it. It answers the same four screens IGI's routes answer, from
 * the same builders in lib/igi/portalViews.js, so the preview is the portal and
 * not a likeness of it.
 *
 * Two properties worth keeping in mind together:
 *
 *   It reads as the service role, because an admin has no IGI row level
 *   policies and would otherwise see an empty portal. That is why loadIgiWorld
 *   filters the reserved serials itself rather than trusting RLS to have done
 *   it — an admin previewing must not see more than IGI would.
 *
 *   It is read only, and there is no preview equivalent of the write routes.
 *   Recording what IGI produced is theirs to do: a LoveLab admin typing it on
 *   their behalf is exactly how a record two companies both trust stops being
 *   one. The screens disable those controls; this side simply has no door.
 */
export async function GET(request, { params }) {
  const auth = await requireLoveLab(request, 'igi-preview');
  if (auth.error) return auth.error;

  const { screen } = await params;
  const view = Object.prototype.hasOwnProperty.call(PORTAL_VIEWS, screen)
    ? PORTAL_VIEWS[screen]
    : null;

  if (!view) {
    return NextResponse.json({ error: 'No such screen' }, { status: 404 });
  }

  try {
    return NextResponse.json(view(await loadIgiWorld(auth.adminSupabase)));
  } catch (err) {
    return fail('IGI/Preview GET', err, 'Failed to load IGI’s screen');
  }
}
