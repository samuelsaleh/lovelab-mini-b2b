import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const API_BASE = process.env.LOVELAB_API_URL || 'https://software.lovelab-antwerp.com/api';

/**
 * GET /api/parties?q=
 * Proxies Laravel party_masters search for Quote Assistant prefill.
 * Admin-only — agents do not see Search ERP Parties.
 */
export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'parties' });
  if (rateLimitRes) return rateLimitRes;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  const q = searchParams.get('q') || searchParams.get('search') || '';
  if (q) qs.set('q', q);
  for (const key of ['branch_id', 'limit']) {
    const val = searchParams.get(key);
    if (val) qs.set(key, val);
  }

  try {
    const res = await fetch(`${API_BASE}/parties?${qs.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || data?.error || 'Failed to load parties' },
        { status: res.status },
      );
    }
    return NextResponse.json({ parties: data.parties || [] });
  } catch (err) {
    console.error('[parties] proxy error:', err.message);
    return NextResponse.json({ error: 'Failed to connect to LoveLab ERP API' }, { status: 502 });
  }
}
