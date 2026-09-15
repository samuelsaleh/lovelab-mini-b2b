/**
 * @jest-environment node
 *
 * The AI key check behind the Outreach banner (Sam, 15 Sep 2026).
 */
const { checkAnthropicKey, isAuthFailure, _resetAiHealthCache } = require('../fair-assistant/aiHealth');

beforeEach(() => { _resetAiHealthCache(); process.env.ANTHROPIC_API_KEY = 'sk-test'; });

describe('checkAnthropicKey', () => {
  test('no key → missing, without calling anyone', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const createMessage = jest.fn();
    expect(await checkAnthropicKey({ createMessage })).toMatchObject({ status: 'missing' });
    expect(createMessage).not.toHaveBeenCalled();
  });

  test('a rejected key → invalid; any other failure → error', async () => {
    expect(await checkAnthropicKey({ createMessage: jest.fn().mockRejectedValue(new Error('invalid x-api-key')) })).toMatchObject({ status: 'invalid' });
    _resetAiHealthCache();
    expect(await checkAnthropicKey({ createMessage: jest.fn().mockRejectedValue(new Error('fetch failed')) })).toMatchObject({ status: 'error', detail: 'fetch failed' });
  });

  test('a working key → ok, and the answer is cached for five minutes', async () => {
    const createMessage = jest.fn().mockResolvedValue({ text: 'pong' });
    expect(await checkAnthropicKey({ createMessage, now: 1000 })).toEqual({ status: 'ok', detail: null });
    await checkAnthropicKey({ createMessage, now: 2000 });
    expect(createMessage).toHaveBeenCalledTimes(1);
    await checkAnthropicKey({ createMessage, now: 1000 + 6 * 60 * 1000 });
    expect(createMessage).toHaveBeenCalledTimes(2);
  });

  test('isAuthFailure spots the key problems', () => {
    expect(isAuthFailure('API key is invalid')).toBe(true);
    expect(isAuthFailure('ANTHROPIC_API_KEY is not configured')).toBe(true);
    expect(isAuthFailure('rate limited')).toBe(false);
  });
});
