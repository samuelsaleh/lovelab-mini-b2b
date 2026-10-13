import crypto from 'crypto';
import { NextResponse } from 'next/server';

export function verifyFairWebhookSecret(request) {
  const secret = process.env.FAIR_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[fair-assistant] FAIR_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const header = request.headers.get('x-fair-auth') || request.headers.get('X-Fair-Auth');
  if (!safeEqual(header, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

// Constant-time comparison, so the secret cannot be guessed one character at a time from response times.
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const y = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(x, y);
}
