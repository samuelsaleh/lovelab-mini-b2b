/**
 * translateText — one field, one language, checked, or refused.
 *
 * The model is scripted. What matters: a same-language request never hits
 * the model, a bad translation is retried with the reason, two bad ones are
 * refused, and brand names survive.
 */
import { translateText } from '@/lib/ai/translateText';

const NOTE = 'Prices for the CUTY and CUBIX 0.30 ct bracelets go up by 5% from October.\nSizes and colours are unchanged.';
const GERMAN = 'Die Preise für die Armbänder CUTY und CUBIX 0,30 ct steigen ab Oktober um 5 %.\nGrößen und Farben bleiben unverändert.';

function scriptedModel({ translations = [], verifications = [] } = {}) {
  const calls = [];
  const createMessage = jest.fn(async ({ model, messages, system }) => {
    const isVerify = model.startsWith('claude-haiku');
    calls.push({ model, prompt: messages[0].content, system });
    if (isVerify) {
      const next = verifications.length ? verifications.shift() : { ok: true };
      return { text: JSON.stringify(next) };
    }
    const next = translations.shift();
    if (next instanceof Error) throw next;
    return { text: typeof next === 'string' ? next : JSON.stringify(next) };
  });
  return { createMessage, calls };
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('translateText', () => {
  test('a good German translation is accepted and verified once', async () => {
    const model = scriptedModel({ translations: [{ text: GERMAN }] });
    const out = await translateText({ text: NOTE, sourceLang: 'en', targetLang: 'de', context: 'price list' }, { createMessage: model.createMessage });
    expect(out).toEqual({ ok: true, text: GERMAN, verified: true });
    expect(model.calls).toHaveLength(2);
    expect(model.calls[0].model).toBe('claude-sonnet-5');
    expect(model.calls[0].prompt).toContain('Target language: German (de)');
    expect(model.calls[0].prompt).toContain('Context: price list');
    expect(model.calls[1].model).toMatch(/^claude-haiku/);
  });

  test('same language never calls the model', async () => {
    const model = scriptedModel();
    const out = await translateText({ text: NOTE, sourceLang: 'fr', targetLang: 'fr' }, { createMessage: model.createMessage });
    expect(out).toEqual({ ok: true, text: NOTE, verified: true });
    expect(model.createMessage).not.toHaveBeenCalled();
  });

  test('a note left in English is retried with the reason, then accepted', async () => {
    const model = scriptedModel({ translations: [{ text: NOTE }, { text: GERMAN }] });
    const out = await translateText({ text: NOTE, sourceLang: 'en', targetLang: 'de' }, { createMessage: model.createMessage });
    expect(out.ok).toBe(true);
    expect(out.text).toBe(GERMAN);
    expect(model.calls[1].prompt).toMatch(/rejected because/);
    expect(model.calls[1].prompt).toMatch(/left in English/);
  });

  test('two unusable replies are refused with a readable reason', async () => {
    const model = scriptedModel({ translations: ['not json at all', { text: '' }] });
    const out = await translateText({ text: NOTE, sourceLang: 'en', targetLang: 'it' }, { createMessage: model.createMessage });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/Translation to Italian was refused/);
  });

  test('a second-opinion rejection is retried, and refused if it persists', async () => {
    const model = scriptedModel({
      translations: [{ text: GERMAN }, { text: GERMAN }],
      verifications: [{ ok: false, problems: ['text: a Dutch sentence'] }, { ok: false, problems: ['text: still Dutch'] }],
    });
    const out = await translateText({ text: NOTE, sourceLang: 'en', targetLang: 'de' }, { createMessage: model.createMessage });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/still Dutch/);
  });

  test('a verification outage does not block, but flags the text as unverified', async () => {
    const model = scriptedModel({ translations: [{ text: GERMAN }], verifications: ['garbage'] });
    model.createMessage.mockImplementationOnce(async (args) => ({ text: JSON.stringify({ text: GERMAN }) }))
      .mockImplementationOnce(async () => { throw new Error('verify down'); });
    const out = await translateText({ text: NOTE, sourceLang: 'en', targetLang: 'de' }, { createMessage: model.createMessage });
    expect(out).toEqual({ ok: true, text: GERMAN, verified: false });
  });

  test('a missing API key reads as a server problem, not a bad translation', async () => {
    const model = scriptedModel({ translations: [new Error('ANTHROPIC_API_KEY is not configured'), new Error('ANTHROPIC_API_KEY is not configured')] });
    const out = await translateText({ text: NOTE, sourceLang: 'en', targetLang: 'fr' }, { createMessage: model.createMessage });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  test('empty text and unknown target are rejected without a model call', async () => {
    const model = scriptedModel();
    expect((await translateText({ text: '  ', sourceLang: 'en', targetLang: 'fr' }, { createMessage: model.createMessage })).ok).toBe(false);
    expect((await translateText({ text: NOTE, sourceLang: 'en', targetLang: 'xx' }, { createMessage: model.createMessage })).ok).toBe(false);
    expect(model.createMessage).not.toHaveBeenCalled();
  });
});
