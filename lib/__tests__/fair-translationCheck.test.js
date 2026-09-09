/**
 * Deterministic checks that decide whether a model translation may be used.
 * Every case here is a failure that would otherwise reach a real buyer.
 */
import { checkTranslation, containsEnglish, foreignClosingIn, describeProblems } from '@/lib/fair-assistant/translationCheck';

const SOURCE = {
  subject: 'LoveLab Antwerp — following up from {fairName}',
  headline: 'Great meeting you',
  paragraph1: 'It was a pleasure connecting at {fairName}. We would love to continue the conversation and share our latest lab-grown coloured-diamond collections with you.',
  paragraph2: 'I would be delighted to send you our lookbook or set up a quick call or Google Meet whenever it suits you. Just reply and let me know what works best.',
  ctaLine: 'In the meantime, feel free to explore our collections at lovelab.be or contact us anytime.',
};

const DUTCH = {
  subject: 'LoveLab Antwerp — vervolg op onze ontmoeting op {fairName}',
  headline: 'Fijn u ontmoet te hebben',
  paragraph1: 'Het was een genoegen om u te ontmoeten tijdens {fairName}. We zouden het gesprek graag voortzetten en onze nieuwste collecties gekweekte gekleurde diamanten met u delen.',
  paragraph2: 'Ik stuur u graag onze lookbook of plan een kort telefoongesprek of Google Meet in wanneer het u uitkomt. Laat me gewoon weten wat het beste past.',
  ctaLine: 'Ontdek intussen gerust onze collecties op lovelab.be of neem op elk moment contact met ons op.',
};

describe('checkTranslation', () => {
  test('a clean Dutch translation passes', () => {
    expect(checkTranslation({ source: SOURCE, translated: DUTCH, language: 'nl' })).toEqual({ ok: true, problems: [] });
  });

  test('a German closing inside a Dutch email is refused', () => {
    const translated = { ...DUTCH, paragraph2: `${DUTCH.paragraph2}\n\nHerzliche Grüße,` };
    const res = checkTranslation({ source: SOURCE, translated, language: 'nl' });
    expect(res.ok).toBe(false);
    expect(describeProblems(res.problems)).toMatch(/paragraph2 contains a DE closing/);
  });

  test('a field left in English is refused', () => {
    const translated = { ...DUTCH, paragraph1: SOURCE.paragraph1 };
    const res = checkTranslation({ source: SOURCE, translated, language: 'nl' });
    expect(res.ok).toBe(false);
    expect(describeProblems(res.problems)).toMatch(/paragraph1 was left in English/);
  });

  test('an English sentence mixed into a Dutch paragraph is refused', () => {
    const translated = { ...DUTCH, paragraph2: `${DUTCH.paragraph2} Just reply and let me know what works best for you and your team.` };
    const res = checkTranslation({ source: SOURCE, translated, language: 'nl' });
    expect(res.ok).toBe(false);
    expect(describeProblems(res.problems)).toMatch(/paragraph2 still contains English/);
  });

  test('a lost placeholder is refused', () => {
    const translated = { ...DUTCH, subject: 'LoveLab Antwerp — vervolg op onze ontmoeting' };
    const res = checkTranslation({ source: SOURCE, translated, language: 'nl' });
    expect(describeProblems(res.problems)).toMatch(/subject lost the placeholder \{fairName\}/);
  });

  test('an empty field is refused', () => {
    const res = checkTranslation({ source: SOURCE, translated: { ...DUTCH, headline: '' }, language: 'nl' });
    expect(describeProblems(res.problems)).toMatch(/headline came back empty/);
  });

  test('Japanese must be written in Japanese script, Dutch must not contain another script', () => {
    const jp = checkTranslation({ source: SOURCE, translated: DUTCH, language: 'ja' });
    expect(jp.ok).toBe(false);
    expect(describeProblems(jp.problems)).toMatch(/not written in the JA script/);

    const mixed = checkTranslation({ source: SOURCE, translated: { ...DUTCH, headline: 'Fijn u ontmoet te hebben 敬具' }, language: 'nl' });
    expect(describeProblems(mixed.problems)).toMatch(/headline contains characters from another script/);
  });

  test('brand names, fair names and URLs do not count as English', () => {
    const translated = { ...DUTCH, ctaLine: 'Ontdek de CUTY, CUBIX, MATCHY en TRIPLY lijnen van LoveLab Antwerp op lovelab.be na JCK Las Vegas.' };
    expect(checkTranslation({ source: SOURCE, translated, language: 'nl' }).ok).toBe(true);
  });

  test('nothing to translate passes untouched', () => {
    expect(checkTranslation({ source: { subject: '', headline: '' }, translated: { subject: '', headline: '' }, language: 'fr' }).ok).toBe(true);
  });
});

describe('helpers', () => {
  test('containsEnglish needs several distinct marker words', () => {
    expect(containsEnglish('Wij tonen de collectie op Google Meet')).toBe(false);
    expect(containsEnglish('We would love to share the collection with you')).toBe(true);
  });

  test('foreignClosingIn ignores the target language and Italian small talk', () => {
    expect(foreignClosingIn('Cordiali saluti, a presto', 'it')).toBeNull();
    expect(foreignClosingIn('Merci encore.\nHerzliche Grüße', 'fr')).toMatchObject({ language: 'de' });
    expect(foreignClosingIn('Merci encore. Bien cordialement,', 'fr')).toBeNull();
  });
});
