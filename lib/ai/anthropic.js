const DEFAULT_MODEL = 'claude-sonnet-5';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);

/**
 * `retries` (default 0, so existing callers behave exactly as before): how many
 * extra tries after a rate limit (429), an overload (529) or a 5xx, waiting for
 * Retry-After when Anthropic sends it (else 1 s, 2 s, 4 s). A 4xx such as 400
 * is a bug in the request and is never retried.
 */
export async function createAnthropicMessage({ system, messages, maxTokens = 1024, model = DEFAULT_MODEL, retries = 0, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce({ apiKey, system, messages, maxTokens, model });
    } catch (err) {
      const retryable = RETRYABLE_STATUS.has(err?.status);
      if (!retryable || attempt >= retries) throw err;
      await sleep(err.retryAfterMs || 1000 * 2 ** attempt);
    }
  }
}

async function requestOnce({ apiKey, system, messages, maxTokens, model }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages,
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data?.error?.message || `Anthropic API error (${response.status})`;
      const err = new Error(errMsg);
      err.status = response.status;
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      if (retryAfter > 0) err.retryAfterMs = retryAfter * 1000;
      throw err;
    }

    const text = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return { text, raw: data };
  } finally {
    clearTimeout(timeout);
  }
}
