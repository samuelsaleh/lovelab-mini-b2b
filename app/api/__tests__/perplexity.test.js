/**
 * @jest-environment node
 *
 * POST /api/perplexity — Agent API translation + health-event wiring.
 *
 * Sam, 9 Sept 2026: Perplexity retired the Sonar chat-completions endpoint
 * (off on 27 Sept 2026) in favour of the Agent API. The proxy now calls
 * /v1/agent and translates both ways so the browser contract is unchanged.
 * These tests pin the translation in each direction and keep the original
 * audit guarantee: upstream errors and network failures surface through
 * recordHealthEvent so admins are alerted when the lookup is broken.
 */

const mockGetUser = jest.fn();
const mockCheckRateLimit = jest.fn(() => null);
const mockRecordHealthEvent = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: (...args) => mockGetUser(...args) },
  }),
}));
jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: (...args) => mockCheckRateLimit(...args),
}));
jest.mock('@/lib/healthEvent', () => ({
  recordHealthEvent: (...args) => mockRecordHealthEvent(...args),
}));

const { POST, toAgentRequest, toAgentModel, toChatShape, PERPLEXITY_AGENT_URL } = require('../perplexity/route');

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_KEY = process.env.PERPLEXITY_API_KEY;

function makeReq(body) {
  return {
    url: 'http://localhost/api/perplexity',
    json: jest.fn().mockResolvedValue(body),
    headers: new Map(),
  };
}

const VALID_BODY = {
  model: 'sonar',
  messages: [{ role: 'user', content: 'hi' }],
  max_tokens: 100,
};

// A realistic Agent API answer for a company lookup.
const AGENT_RESPONSE = {
  id: 'resp_1',
  model: 'sonar-pro',
  status: 'completed',
  output: [
    {
      type: 'search_results',
      queries: ['Nanau Vertriebsgesellschaft address'],
      results: [
        { id: 1, url: 'https://nanau.example/impressum', title: 'Impressum', snippet: 'Musterstr. 1' },
        { id: 2, url: 'https://register.example/nanau', title: 'Register', snippet: '…' },
      ],
    },
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: '{"address":"Musterstr. 1","city":"Berlin","zip":"10115","country":"Germany","vat":""} [1]' }],
    },
  ],
  usage: { input_tokens: 10, output_tokens: 20 },
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.PERPLEXITY_API_KEY = 'test-key';
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_KEY === undefined) delete process.env.PERPLEXITY_API_KEY;
  else process.env.PERPLEXITY_API_KEY = ORIGINAL_KEY;
});

describe('toAgentRequest — chat completions → Agent API', () => {
  it('folds the user prompt into input, caps tokens, and asks for web search', () => {
    const body = toAgentRequest({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: 'Company details lookup.\nCompany: Nanau' }],
      maxTokens: 500,
      webSearchOptions: { search_context_size: 'high' },
    });
    expect(body).toEqual({
      model: 'perplexity/sonar-pro',
      input: 'Company details lookup.\nCompany: Nanau',
      max_output_tokens: 500,
      tools: [{ type: 'web_search', search_context_size: 'high' }],
    });
  });

  it('addresses the model as provider/model, without doubling an existing prefix', () => {
    expect(toAgentModel('sonar')).toBe('perplexity/sonar');
    expect(toAgentModel('perplexity/sonar-pro')).toBe('perplexity/sonar-pro');
  });

  it('turns a system message into instructions and keeps the turns in order', () => {
    const body = toAgentRequest({
      model: 'sonar',
      messages: [
        { role: 'system', content: 'Answer in JSON.' },
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'second' },
      ],
      maxTokens: 50,
      webSearchOptions: null,
    });
    expect(body.instructions).toBe('Answer in JSON.');
    expect(body.input).toBe('first\n\nok\n\nsecond');
    expect(body.tools).toEqual([{ type: 'web_search' }]);
  });

  it('ignores an invalid search_context_size rather than forwarding it', () => {
    const body = toAgentRequest({
      model: 'sonar',
      messages: [{ role: 'user', content: 'x' }],
      maxTokens: 10,
      webSearchOptions: { search_context_size: 'enormous' },
    });
    expect(body.tools).toEqual([{ type: 'web_search' }]);
  });

  it('reads array-style content parts', () => {
    const body = toAgentRequest({
      model: 'sonar',
      messages: [{ role: 'user', content: [{ type: 'input_text', text: 'a' }, { type: 'input_text', text: 'b' }] }],
      maxTokens: 10,
    });
    expect(body.input).toBe('a\nb');
  });
});

describe('toChatShape — Agent API → what lib/api.js reads', () => {
  it('puts the answer in choices[0].message.content and the URLs in citations', () => {
    const shaped = toChatShape(AGENT_RESPONSE);
    expect(shaped.choices[0].message.content).toContain('"city":"Berlin"');
    expect(shaped.citations).toEqual(['https://nanau.example/impressum', 'https://register.example/nanau']);
    expect(shaped.search_results).toHaveLength(2);
    expect(shaped.model).toBe('sonar-pro');
    expect(shaped.usage).toEqual({ input_tokens: 10, output_tokens: 20 });
  });

  it('prefers output_text when Perplexity provides it', () => {
    const shaped = toChatShape({ output_text: 'direct', output: AGENT_RESPONSE.output });
    expect(shaped.choices[0].message.content).toBe('direct');
  });

  it('survives an empty or malformed body', () => {
    expect(toChatShape({}).choices[0].message.content).toBe('');
    expect(toChatShape(null).citations).toEqual([]);
    expect(toChatShape({ output: 'nope' }).choices[0].message.content).toBe('');
  });
});

describe('POST /api/perplexity', () => {
  it('calls the Agent API with the translated body and returns the chat shape', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(AGENT_RESPONSE),
    });

    const res = await POST(makeReq({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: 'Company details lookup.' }],
      max_tokens: 500,
      web_search_options: { search_context_size: 'high' },
    }));
    expect(res.status).toBe(200);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(PERPLEXITY_AGENT_URL);
    expect(url).toBe('https://api.perplexity.ai/v1/agent');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const sent = JSON.parse(init.body);
    expect(sent).toEqual({
      model: 'perplexity/sonar-pro',
      input: 'Company details lookup.',
      max_output_tokens: 500,
      tools: [{ type: 'web_search', search_context_size: 'high' }],
    });

    const json = await res.json();
    expect(json.choices[0].message.content).toContain('"address":"Musterstr. 1"');
    expect(json.citations[0]).toBe('https://nanau.example/impressum');
    expect(mockRecordHealthEvent).not.toHaveBeenCalled();
  });

  it('caps max_tokens at the proxy limit', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: jest.fn().mockResolvedValue(AGENT_RESPONSE) });
    await POST(makeReq({ ...VALID_BODY, max_tokens: 999999 }));
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).max_output_tokens).toBe(2048);
  });

  it('refuses a model that is not on the Sonar list', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, model: 'gpt-4o' }));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses the retired sonar-reasoning model', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, model: 'sonar-reasoning' }));
    expect(res.status).toBe(400);
  });

  it('refuses messages with no text', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, messages: [{ role: 'system', content: 'only a system prompt' }] }));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('records a health event when upstream returns a non-OK response', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({ error: { message: 'service unavailable' } }),
    });

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(503);

    expect(mockRecordHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'perplexity_proxy',
        severity: 'warn',
        message: 'service unavailable',
        context: expect.objectContaining({ status: 503, endpoint: 'agent' }),
      }),
    );
  });

  it('surfaces an invalid API key as a 401 with Perplexity\'s own message', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ error: { message: 'Invalid API key provided. Ensure your API key is correct and active.', type: 'invalid_api_key', code: 401 } }),
    });
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/Invalid API key/);
    expect(mockRecordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'perplexity_proxy' }));
  });

  it('records a health event when upstream fetch rejects', async () => {
    global.fetch.mockRejectedValue(new Error('ETIMEDOUT'));

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(500);

    expect(mockRecordHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'perplexity_proxy',
        severity: 'warn',
        message: 'ETIMEDOUT',
      }),
    );
  });

  it('does NOT record a health event for a successful response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(AGENT_RESPONSE),
    });

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    expect(mockRecordHealthEvent).not.toHaveBeenCalled();
  });
});
