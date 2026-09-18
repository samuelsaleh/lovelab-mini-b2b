import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { todoView } from '@/lib/igi/portalViews';

/**
 * GET /api/igi/preview/todo — IGI's To do, served to a LoveLab admin.
 *
 * The same builder their own route calls, so this is their screen rather than a
 * likeness of it. It reads as the service role, because an admin holds no IGI
 * row level policies and would otherwise see an empty portal — which is why
 * loadIgiWorld filters the reserved serials itself.
 */
export async function GET(request) {
  const auth = await requireLoveLab(request, 'igi-preview');
  if (auth.error) return auth.error;

  try {
    return NextResponse.json(todoView(await loadIgiWorld(auth.adminSupabase)));
  } catch (err) {
    return fail('IGI/Preview todo', err, 'Failed to load IGI’s screen');
  }
}
