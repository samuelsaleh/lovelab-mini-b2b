import { NextResponse } from 'next/server';

const API_BASE = 'https://software.love-lab.com/api';

export async function GET(request) {
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
