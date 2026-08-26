import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const API_BASE = process.env.LOVELAB_API_URL || 'https://software.love-lab.com/api';

async function requireAdmin(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'out-memos' });
  if (rateLimitRes) return { error: rateLimitRes };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, profile };
}

/**
 * GET /api/admin/out-memos?memo_type=Agent|Party|Internal&from=&to=
 * Proxies Laravel jewellery-memos/out (pending out memos).
 */
export async function GET(request) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of ['memo_type', 'from', 'to', 'branch_id']) {
    const val = searchParams.get(key);
    if (val) qs.set(key, val);
  }

  try {
    const res = await fetch(`${API_BASE}/jewellery-memos/out?${qs.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || data?.error || 'Failed to load out memos' },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[out-memos] proxy error:', err.message);
    return NextResponse.json({ error: 'Failed to connect to LoveLab ERP API' }, { status: 502 });
  }
}
