/**
 * translateEmailSlots / buildEmailForLead — one language, checked, or nothing.
 *
 * The model is a mock. What matters: a bad translation is retried with the
 * reason, a second bad one is refused, a refused translation never becomes
 * an email, and the sign-off is always the fixed one for the language.
 */
import { translateEmailSlots, buildEmailForLead, translateSlotsForLanguages, TranslationUnavailableError } from '@/lib/fair-assistant/translate';

const SLOTS = {
  subject: 'LoveLab Antwerp — following up from {fairName}',
  headline: 'Great meeting you',
  paragraph1: 'It was a pleasure connecting at {fairName}. We would love to continue the conversation and share our latest lab-grown coloured-diamond collections with you.',
  paragraph2: 'I would be delighted to send you our lookbook or set up a quick call or Google Meet whenever it suits you. Just reply and let me know what works best.',
  signoff: 'Warm regards,\nAlberto Saleh\nLoveLab Antwerp',
  ctaLine: 'In the meantime, feel free to explore our collections at lovelab.be or contact us anytime.',
  fairName: 'Bijorhca Sept 2026',
};

const DUTCH = {
  subject: 'LoveLab Antwerp — vervolg op onze ontmoeting op {fairName}',
  headline: 'Fijn u ontmoet te hebben',
  paragraph1: 'Het was een genoegen om u te ontmoeten tijdens {fairName}. We zouden het gesprek graag voortzetten en onze nieuwste collecties gekweekte gekleurde diamanten met u delen.',
  paragraph2: 'Ik stuur u graag onze lookbook of plan een kort telefoongesprek of Google Meet in wanneer het u uitkomt. Laat me gewoon weten wat het beste past.',
  ctaLine: 'Ontdek intussen gerust onze collecties op lovelab.be of neem op elk moment contact met ons op.',
};

const GERMAN_CLOSING = { ...DUTCH, paragraph2: `${DUTCH.paragraph2}\n\nHerzliche Grüße,` };

const LEAD = { first_name: 'Audrey', last_name: 'Dupont', company: 'Bijoux Audrey', country: 'Belgium', language: 'nl' };

// Scripted model: translation replies in order, verification replies in order.
function scriptedModel({ translations = [], verifications = [] } = {}) {
  const calls = [];
  const createMessage = jest.fn(async ({ model, messages }) => {
    const isVerify = model.startsWith('claude-haiku');
    calls.push({ model, prompt: messages[0].content });
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

describe('translateEmailSlots', () => {
  test('a good Dutch translation is accepted, verified once, and signed off in Dutch', async () => {
    const model = scriptedModel({ translations: [DUTCH] });
    const out = await translateEmailSlots(SLOTS, 'nl', { createMessage: model.createMessage });
    expect(out.__translationFailed).toBeUndefined();
    expect(out.paragraph1).toBe(DUTCH.paragraph1);
    expect(out.signoff).toBe('Met vriendelijke groet,\nAlberto Saleh\nLoveLab Antwerp');
    expect(out.__verified).toBe(true);
    expect(model.calls.map((c) => c.model)).toEqual(['claude-sonnet-5', 'claude-haiku-4-5-20251001']);
  });

  test('the sign-off is never sent to the model and never asked for', async () => {
    const model = scriptedModel({ translations: [DUTCH] });
    await translateEmailSlots(SLOTS, 'nl', { createMessage: model.createMessage });
    const prompt = model.calls[0].prompt;
    expect(prompt).not.toMatch(/signoff/);
    expect(prompt).not.toMatch(/Alberto Saleh/);
    expect(prompt).not.toMatch(/Herzliche/);
  });

  test('a German closing in a Dutch translation is rejected, retried with the reason, then accepted', async () => {
    const model = scriptedModel({ translations: [GERMAN_CLOSING, DUTCH] });
    const out = await translateEmailSlots(SLOTS, 'nl', { createMessage: model.createMessage });
    expect(out.__translationFailed).toBeUndefined();
    expect(out.paragraph2).not.toMatch(/Grüße/);
    const retryPrompt = model.calls[1].prompt;
    expect(retryPrompt).toMatch(/previous attempt was rejected/);
    expect(retryPrompt).toMatch(/DE closing/);
  });

  test('two bad attempts are refused — English is never returned as Dutch', async () => {
    const model = scriptedModel({ translations: [GERMAN_CLOSING, { ...DUTCH, paragraph1: SLOTS.paragraph1 }] });
    const out = await translateEmailSlots(SLOTS, 'nl', { createMessage: model.createMessage });
    expect(out.__translationFailed).toBe(true);
    expect(out.__translationError).toMatch(/Translation to Dutch was refused/);
    expect(out.__translationError).toMatch(/paragraph1 was left in English/);
  });

  test('the language check can reject what the word lists missed', async () => {
    const model = scriptedModel({
      translations: [DUTCH, DUTCH],
      verifications: [{ ok: false, problems: ['paragraph2: last sentence is German'] }, { ok: true }],
    });
    const out = await translateEmailSlots(SLOTS, 'nl', { createMessage: model.createMessage });
    expect(out.__translationFailed).toBeUndefined();
    expect(model.calls[2].prompt).toMatch(/last sentence is German/);
  });

  test('an unreadable reply is retried, a second one refused', async () => {
    const model = scriptedModel({ translations: ['Sorry, here is the translation: nope', new Error('overloaded')] });
    const out = await translateEmailSlots(SLOTS, 'nl', { createMessage: model.createMessage });
    expect(out.__translationFailed).toBe(true);
    expect(out.__translationError).toMatch(/overloaded/);
  });

  test('a language verification outage does not block a translation that passed the checks', async () => {
    const createMessage = jest.fn(async ({ model }) => {
      if (model.startsWith('claude-haiku')) throw new Error('verify down');
      return { text: JSON.stringify(DUTCH) };
    });
    const out = await translateEmailSlots(SLOTS, 'nl', { createMessage });
    expect(out.__translationFailed).toBeUndefined();
    expect(out.__verified).toBe(false);
  });

  test('English is returned as written, with its own closing kept', async () => {
    const model = scriptedModel();
    const out = await translateEmailSlots(SLOTS, 'en', { createMessage: model.createMessage });
    expect(out.signoff).toBe(SLOTS.signoff);
    expect(model.createMessage).not.toHaveBeenCalled();
  });

  test('a language without a fixed closing is refused rather than guessed', async () => {
    const model = scriptedModel({ translations: [DUTCH] });
    const out = await translateEmailSlots(SLOTS, 'xx', { createMessage: model.createMessage });
    expect(out.__translationFailed).toBe(true);
    expect(model.createMessage).not.toHaveBeenCalled();
  });
});

describe('buildEmailForLead', () => {
  test('writes one email in one language with the fixed sign-off', async () => {
    const model = scriptedModel({ translations: [DUTCH] });
    const translatedByLanguage = await translateSlotsForLanguages(SLOTS, ['nl'], { createMessage: model.createMessage });
    const email = buildEmailForLead({ siteUrl: 'https://b2b-lovelab.com', lead: LEAD, templateSlots: SLOTS, translatedByLanguage, language: 'nl' });
    expect(email.language).toBe('nl');
    expect(email.subject).toBe('LoveLab Antwerp — vervolg op onze ontmoeting op Bijorhca Sept 2026');
    expect(email.bodyHtml).toContain('Hallo Audrey,');
    expect(email.bodyHtml).toContain('Met vriendelijke groet,<br>Alberto Saleh<br>LoveLab Antwerp');
    expect(email.bodyHtml).not.toMatch(/Grüße/);
    expect(email.bodyHtml).not.toMatch(/Bonjour/);
    expect(email.bodyHtml).not.toMatch(/Warm regards/);
  });

  test('ignores any sign-off the model might have returned', () => {
    const translatedByLanguage = { nl: { ...SLOTS, ...DUTCH, signoff: 'Herzliche Grüße,\nAlberto Saleh\nLoveLab Antwerp' } };
    const email = buildEmailForLead({ siteUrl: 'x', lead: LEAD, templateSlots: SLOTS, translatedByLanguage, language: 'nl' });
    expect(email.bodyHtml).not.toMatch(/Grüße/);
    expect(email.bodyHtml).toContain('Met vriendelijke groet,');
  });

  test('refuses to build an email from a failed translation', () => {
    const translatedByLanguage = { nl: { ...SLOTS, __translationFailed: true, __translationError: 'Translation to Dutch was refused: paragraph1 was left in English' } };
    expect(() => buildEmailForLead({ siteUrl: 'x', lead: LEAD, templateSlots: SLOTS, translatedByLanguage, language: 'nl' }))
      .toThrow(TranslationUnavailableError);
    expect(() => buildEmailForLead({ siteUrl: 'x', lead: LEAD, templateSlots: SLOTS, translatedByLanguage: {}, language: 'fr' }))
      .toThrow(/French/);
  });

  test('an English lead gets the English template with its own closing', () => {
    const email = buildEmailForLead({ siteUrl: 'x', lead: { ...LEAD, language: 'en' }, templateSlots: SLOTS, translatedByLanguage: {}, language: 'en' });
    expect(email.language).toBe('en');
    expect(email.bodyHtml).toContain('Warm regards,<br>Alberto Saleh<br>LoveLab Antwerp');
  });
});
