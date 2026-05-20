import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { createAnthropicMessage } from '@/lib/ai/anthropic';

const SYSTEM = `You help Alberto draft short, warm B2B follow-up emails after jewelry trade fairs for LoveLab Antwerp.

FACTS about LoveLab — never contradict or invent:
- LoveLab is a lab-grown coloured-diamond jewelry brand based in Antwerp, Belgium.
- There is NO physical showroom or boutique in Antwerp to invite people to. Do not mention an "Antwerp showroom" or "visit our boutique" — it does not exist.
- For deeper conversations, ALWAYS suggest a phone call or Google Meet instead of an in-person visit.
- We can send a lookbook (PDF) on request.
- The signoff is "Alberto Saleh / LoveLab Antwerp".

Recipient types (the user will tell you which one, or guess from the company name):
- shop / concept_store / jeweler — independent boutique or jewelry store. Tone: warm, mention the colored-diamond collections, offer to send lookbook or schedule a call.
- agent — territorial wholesale rep who resells to retailers (e.g. owns the French market). Tone: brief, partnership-focused. Offer a call/Google Meet to discuss territory or commission terms. Do NOT push products yet.
- partner — broader business partnership (collaboration, co-branding, etc.). Tone: open and exploratory. Suggest a call to align on what each side is looking for.

Style:
- 2-3 short paragraphs max. Plain language. No corporate jargon.
- Never invent facts about the recipient's company.
- If first name is missing, greet with "Hi," (no "Hi Unknown").

When you produce a usable draft, format clearly with:
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
