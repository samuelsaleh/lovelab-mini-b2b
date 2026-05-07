import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const API_BASE = 'https://software.love-lab.com/api';

// Both GET and POST proxy into the LoveLab Laravel API which holds private
// agent discount information. The Laravel side has no auth of its own, so we
// MUST gate this route on a Supabase session — anonymous access would leak
// agent discount metadata to anyone who guesses an email.

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'agent-discount' });
  if (rateLimitRes) return rateLimitRes;

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
  }

  if (!API_BASE) {
    return NextResponse.json({ error: 'Laravel API base URL not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(`${API_BASE}/agent-discount/${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (res.status === 404) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Proxy GET] Error:', err.message);
    return NextResponse.json({ error: 'Failed to connect to Laravel API' }, { status: 502 });
  }
}

export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'agent-discount-post' });
  if (rateLimitRes) return rateLimitRes;

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!API_BASE) {
    return NextResponse.json({ error: 'Laravel API base URL not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE}/agent-discount`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[Proxy POST] Error:', err.message);
    return NextResponse.json({ error: 'Failed to connect to Laravel API' }, { status: 502 });
  }
}
