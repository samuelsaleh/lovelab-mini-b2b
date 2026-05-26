const DEFAULT_MODEL = 'claude-sonnet-4-6';

export async function createAnthropicMessage({ system, messages, maxTokens = 1024, model = DEFAULT_MODEL }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

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
      throw new Error(errMsg);
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
