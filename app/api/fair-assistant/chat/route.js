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

Editable elements (the user can tweak any of these via the Outreach tab):
- Headline (large serif title) — keep generic; the fair name shows as a gold subtitle automatically
- Paragraph 1 and Paragraph 2 (body text)
- Button 1: label + URL (filled purple pill, defaults to "Visit Our Website" → lovelab.be)
- Button 2: label + URL (outline pill, defaults to "B2B Login" → lovelab.be/b2b-signup; leave blank to hide)
- CTA line (optional sentence under paragraph 2)
- Signoff
- Contact card and the 2×2 product grid are FIXED — they're part of the brand shell and not editable per fair.

When the user asks to personalize buttons / links — e.g. "swap B2B Login for a Calendly link", "make the second button send to our agents page", "hide the second button on agent emails" — propose concrete values:
Button1Label: ...
Button1URL: ...
Button2Label: ...
Button2URL: ...

HOW THE USER APPLIES YOUR OUTPUT — IMPORTANT:
The chat UI scans your reply for "Field: value" lines and shows the user a pill button for each field you propose. The user taps a pill to apply that specific field to their form, or "Apply all" to take everything. So your output IS the action — there is no extra "do it" step. Be decisive and ship.

OUTPUT FORMAT — strict:
When the user asks you to draft or refine the email, your reply MUST end with the proposed fields, each on its own line, exactly in this shape (and only the fields that need to change):

Subject: ...
Headline: ...
Paragraph1: ...
Paragraph2: ...
Signoff: ...
Button1Label: ...
Button1URL: ...
Button2Label: ...
Button2URL: ...

Rules:
- Only emit fields you're actually proposing — don't echo unchanged fields.
- One line per field. If a paragraph needs multiple sentences keep them on one line (the email shell handles spacing).
- Don't wrap in markdown code fences.
- Don't say "let me know if you'd like me to apply this" — the user has Apply buttons for that.

You ALREADY HAVE the batch's current template + the fair name + the number of leads in context. You do NOT need to ask the user for that. If the user picks "B" from a list you offered, just ship Option B's content as Field: lines. Don't ask "shall I update the form?" — emit the fields; the pills do the rest.

ASKING for info is only OK when:
- The user's request is genuinely ambiguous about something not in context (e.g., they say "make it sound like the way I emailed Pierre last month" — you've never seen that email).
- The user explicitly asks for options before committing (e.g., "give me 3 versions").

OUT OF SCOPE — do not write:
- HTML, CSS, <style> blocks, or any markup. Plain text only.
- The recipient's name as part of paragraph text. The greeting ("Hi {firstName},") is rendered automatically by the email shell.
- The fair name in the Headline — the gold subtitle below it shows the fair automatically, so "Headline: Great meeting you" is enough.

The surrounding LoveLab brand shell (logo, fair-name subtitle, CTA buttons, product grid, contact card, footer) is rendered automatically. Focus on tight, warm copy — that's where you add the most value.`;

// GET — load the persisted chat history for a batch.
export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'fair-chat' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get('batchId');
  if (!batchId) {
    return NextResponse.json({ messages: [] });
  }

  const { data, error } = await auth.adminSupabase
    .from('fair_chat_messages')
    .select('id, role, content, created_at')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[fair-chat GET]', error.message);
    return NextResponse.json({ error: 'Failed to load chat history' }, { status: 500 });
  }

  return NextResponse.json({ messages: data || [] });
}

export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 20, prefix: 'fair-chat' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const messages = body.messages;
  const context = body.context || {};
  const batchId = context.batch?.id || body.batchId || null;

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

    // Persist anything in messages[] that isn't already in the DB, plus the
    // new assistant reply. Previous version only inserted the LAST user turn,
    // which dropped messages when the user typed two prompts back-to-back
    // before the first response returned.
    if (batchId) {
      const { data: existing } = await auth.adminSupabase
        .from('fair_chat_messages')
        .select('content, role, created_at')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: true });
      // Use a content+role tuple as the dedup key — cheap and correct for the
      // realistic case where the same user doesn't send the exact same string
      // twice in one session.
      const seen = new Set((existing || []).map((m) => `${m.role}::${m.content}`));
      const rowsToInsert = [];
      for (const m of messages) {
        if (!m?.content) continue;
        const key = `${m.role}::${String(m.content)}`;
        if (!seen.has(key)) {
          rowsToInsert.push({ batch_id: batchId, role: m.role, content: String(m.content) });
          seen.add(key);
        }
      }
      rowsToInsert.push({ batch_id: batchId, role: 'assistant', content: text });
      const { error: insErr } = await auth.adminSupabase
        .from('fair_chat_messages')
        .insert(rowsToInsert);
      if (insErr) {
        // Persistence failure should not fail the chat — log and continue.
        console.error('[fair-chat persist]', insErr.message);
      }
    }

    return NextResponse.json({ message: text });
  } catch (err) {
    console.error('[fair-chat]', err.message);
    return NextResponse.json({ error: err.message || 'Chat failed' }, { status: 502 });
  }
}

// DELETE — wipe a batch's chat history (useful when starting fresh).
export async function DELETE(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'fair-chat' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get('batchId');
  if (!batchId) {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  }

  const { error } = await auth.adminSupabase
    .from('fair_chat_messages')
    .delete()
    .eq('batch_id', batchId);

  if (error) {
    console.error('[fair-chat DELETE]', error.message);
    return NextResponse.json({ error: 'Failed to clear chat' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
