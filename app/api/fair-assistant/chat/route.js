import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { createAnthropicMessage } from '@/lib/ai/anthropic';

const SYSTEM = `You help Alberto draft short, warm B2B follow-up emails after jewelry trade fairs for LoveLab Antwerp.
Keep messages professional, concise (2-3 short paragraphs max), and never invent facts about the recipient's company.
When you produce a usable draft, format it clearly with:
Subject: ...
Headline: ...
Paragraph1: ...
Paragraph2: ...
Signoff: ...`;

export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'fair-chat' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const messages = body.messages;
  const context = body.context || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
  }

  const contextBlock = context.batch
    ? `\n\nCurrent batch context:\nFair: ${context.batch.fair_name || context.batch.name}\nLeads: ${context.leadCount || 0}\nCurrent template:\nHeadline: ${context.batch.headline || ''}\nParagraph1: ${context.batch.paragraph1 || ''}\nParagraph2: ${context.batch.paragraph2 || ''}\nSignoff: ${context.batch.signoff || ''}`
    : '';

  try {
    const { text } = await createAnthropicMessage({
      system: SYSTEM + contextBlock,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: 1200,
    });

    return NextResponse.json({ message: text });
  } catch (err) {
    console.error('[fair-chat]', err.message);
    return NextResponse.json({ error: err.message || 'Chat failed' }, { status: 502 });
  }
}
