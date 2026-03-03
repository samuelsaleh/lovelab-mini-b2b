import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

const MODEL = 'claude-3-5-haiku-20241022';

// POST /api/agents/[id]/extract-commission
// Sends the contract text to Claude and returns a proposed commission config JSON.
// Does NOT save anything — caller must confirm via PATCH /commission-config.
// Access: admin only.
export async function POST(request, { params }) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'extract-commission' });
    if (rateLimitRes) return rateLimitRes;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminSupabase = createAdminClient();
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: agentId } = await params;
    const { contractText } = await request.json();

    if (!contractText || contractText.trim().length < 10) {
      return NextResponse.json({ error: 'Contract text is required' }, { status: 400 });
    }

    const systemPrompt = `You are a commission structure extractor for LoveLab, a B2B jewellery brand.
You will be given the text of an agent's contract. Extract the compensation/commission structure and return it as a JSON object.

OUTPUT: Return ONLY a valid JSON object. No markdown, no backticks, no explanation text outside the JSON.

The JSON must have a "type" field and follow one of these schemas exactly:

1. Flat rate:
   { "type": "flat", "rate": 12, "description": "12% on all orders" }

2. Tiered (based on cumulative revenue):
   { "type": "tiered", "tiers": [{ "upTo": 50000, "rate": 10 }, { "rate": 15 }], "description": "10% up to €50k/year, then 15%" }
   (The last tier has no "upTo" — it applies above all previous thresholds)

3. Per product category:
   { "type": "category", "rates": { "CUBIX": 12, "CUTY": 10 }, "default": 8, "description": "..." }

4. Complex / cannot determine automatically:
   { "type": "complex", "description": "Describe what you found in plain language so a human can review" }

Rules:
- Rates are always percentages (0–100), never decimals like 0.12.
- If you cannot find a clear commission structure, use type "complex" with a description of what you found.
- If multiple structures are mentioned, pick the primary one or use type "complex".
- Keep descriptions concise (under 100 characters).`;

    const body = {
      model: MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Contract text:\n\n${contractText.slice(0, 8000)}` }],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let raw;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('[extract-commission] Anthropic error:', errData);
        return NextResponse.json({ error: 'AI service error' }, { status: 502 });
      }

      const data = await res.json();
      raw = data?.content?.[0]?.text?.trim() || '';
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        console.error('[extract-commission] Timeout after 30s');
        return NextResponse.json({ error: 'AI service timed out. Please try again.' }, { status: 504 });
      }
      console.error('[extract-commission] Fetch error:', fetchErr.message);
      return NextResponse.json({ error: 'AI service error' }, { status: 502 });
    }

    let proposed;
    try {
      proposed = JSON.parse(raw);
    } catch (parseErr) {
      console.error('[extract-commission] Parse error:', parseErr.message);
      return NextResponse.json({
        proposed: { type: 'complex', description: 'Could not automatically parse the commission structure. Please review the contract manually.' },
      });
    }

    return NextResponse.json({ proposed });
  } catch (err) {
    console.error('[extract-commission] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
