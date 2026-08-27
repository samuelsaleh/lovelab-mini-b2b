import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const API_BASE = process.env.LOVELAB_API_URL || 'https://software.love-lab.com/api';
const MEMO_TYPES = new Set(['Agent', 'Party', 'Internal']);

async function requireAdmin(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'out-memos-party-type' });
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
 * POST /api/admin/out-memos/party-type
 * Body: { party, memo_type: Agent|Party|Internal }
 * Updates party_masters.memo_type in LoveLab ERP.
 */
export async function POST(request) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const party = typeof body?.party === 'string' ? body.party.trim() : '';
  const memoType = body?.memo_type;
  if (!party) {
    return NextResponse.json({ error: 'party is required' }, { status: 400 });
  }
  if (!MEMO_TYPES.has(memoType)) {
    return NextResponse.json({ error: 'memo_type must be Agent, Party, or Internal' }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_BASE}/jewellery-memos/party-memo-type`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ party, memo_type: memoType }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || data?.error || 'Failed to update party type' },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[out-memos party-type] proxy error:', err.message);
    return NextResponse.json({ error: 'Failed to connect to LoveLab ERP API' }, { status: 502 });
  }
}
