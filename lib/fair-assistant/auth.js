import { NextResponse } from 'next/server';

export function verifyFairWebhookSecret(request) {
  const secret = process.env.FAIR_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[fair-assistant] FAIR_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const header = request.headers.get('x-fair-auth') || request.headers.get('X-Fair-Auth');
  if (header !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
