/**
 * Can the server talk to Claude? (Sam, 15 Sep 2026)
 *
 * The Fair Assistant translates every non-English email with Claude, so a
 * missing or rejected ANTHROPIC_API_KEY means no email can go out to a
 * French, Dutch or Greek lead. The Outreach tab asks this before anyone
 * presses Send, instead of discovering it in a translation error.
 *
 * One tiny call; the answer is remembered for five minutes.
 */
import { createAnthropicMessage } from '@/lib/ai/anthropic';

const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, value: null };
export function _resetAiHealthCache() { cache = { at: 0, value: null }; }

export function isAuthFailure(message) {
  return /api key|authentication|not configured|x-api-key/i.test(String(message || ''));
}

/** @returns {{ status: 'ok'|'missing'|'invalid'|'error', detail: string|null }} */
export async function checkAnthropicKey({ now = Date.now(), createMessage = createAnthropicMessage } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return { status: 'missing', detail: 'ANTHROPIC_API_KEY is not set on the server.' };
  if (cache.value && now - cache.at < TTL_MS) return cache.value;
  let value;
  try {
    await createMessage({ system: 'Reply with one word.', messages: [{ role: 'user', content: 'ping' }], maxTokens: 1, model: 'claude-haiku-4-5-20251001' });
    value = { status: 'ok', detail: null };
  } catch (err) {
    const msg = String(err?.message || '');
    value = isAuthFailure(msg)
      ? { status: 'invalid', detail: "Anthropic rejected the server's ANTHROPIC_API_KEY." }
      : { status: 'error', detail: msg || 'The AI service did not answer.' };
  }
  cache = { at: now, value };
  return value;
}
