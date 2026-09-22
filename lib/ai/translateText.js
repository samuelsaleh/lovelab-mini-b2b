/**
 * Translate one short text into one language, checked, or refuse.
 *
 * The fair-assistant translator (lib/fair-assistant/translate.js) is bound
 * to its five template slots and its own sign-off rules. Price list notes
 * are a single free-text field, so this is the same discipline on one field:
 * ask, check deterministically, ask a cheap second model whether it really
 * is the target language, retry once with the reason, then refuse. An
 * unverified translation is never handed back as if it were good.
 */
import { createAnthropicMessage } from '@/lib/ai/anthropic';
import { extractJsonObject, verifyLanguage, describeApiFailure } from '@/lib/fair-assistant/translate';
import { checkTranslation, describeProblems } from '@/lib/fair-assistant/translationCheck';
import { languageLabel, isSupportedLanguage } from '@/lib/fair-assistant/languages';

// Same model as the fair follow-ups: these notes go to LoveLab's own agents
// in their language and the register matters more than the per-call cost.
const TRANSLATE_MODEL = 'claude-sonnet-5';

const SYSTEM = `You translate a short internal notice from LoveLab (a lab-grown diamond jewelry brand) to its sales agents into ONE target language.

OUTPUT FORMAT — strict:
- Reply with a JSON object and NOTHING ELSE. No prose before, no commentary after, no markdown fences.
- The JSON must have exactly one key: "text".
- Do NOT include HTML tags.

CONTENT RULES:
- Every word must be in the target language. Never leave a sentence, phrase or word in the source language or in any other language. Never mix languages.
- Do not add a greeting or a closing phrase: they are added separately.
- Keep the line breaks of the source (use \\n in the JSON string where the source has a new line).
- Keep the meaning exactly; do not add, drop or soften facts. Do not add facts about the company beyond what is provided.
- Brand and collection names (LoveLab, Love Group BV, CUTY, CUBIX, MULTI THREE/FOUR/FIVE, MATCHY, SHAPY SHINE, SHAPY SPARKLE, HOLY, MOONLIGHT, SIENNA, RIVIERA, LINEA, ZA-HA, FLOWER), numbers, prices, carat weights, dates and URLs stay verbatim.
- Tone: professional, direct, concise — a notice from head office to its sales team.`;

function normaliseLang(code) {
  return String(code || '').trim().toLowerCase();
}

/**
 * @param {object} params
 * @param {string} params.text        - The note in `sourceLang`.
 * @param {string} params.sourceLang  - Language the note is written in.
 * @param {string} params.targetLang  - Language to translate into.
 * @param {string} [params.context]   - One line of context for the model (what the note is about).
 * @param {object} [deps]             - { createMessage, model } for tests.
 * @returns {Promise<{ ok: true, text: string, verified: boolean } | { ok: false, error: string }>}
 */
export async function translateText({ text, sourceLang, targetLang, context }, deps = {}) {
  const createMessage = deps.createMessage || createAnthropicMessage;
  const model = deps.model || TRANSLATE_MODEL;
  const source = String(text || '').trim();
  const from = normaliseLang(sourceLang);
  const to = normaliseLang(targetLang);

  if (!source) return { ok: false, error: 'nothing to translate' };
  if (!isSupportedLanguage(to)) return { ok: false, error: `${to || '?'} is not a language this tool can write in` };
  if (from === to) return { ok: true, text: source, verified: true };

  const label = languageLabel(to);
  const fromLabel = isSupportedLanguage(from) ? languageLabel(from) : 'the source language';
  let previousProblems = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let translated;
    try {
      const feedback = previousProblems
        ? `\n\nYour previous attempt was rejected because: ${previousProblems}. Fix this. The whole text must be entirely in ${label}.`
        : '';
      const res = await createMessage({
        model,
        system: SYSTEM,
        maxTokens: 1500,
        messages: [{
          role: 'user',
          content: `Source language: ${fromLabel}\nTarget language: ${label} (${to})${context ? `\nContext: ${context}` : ''}\n\nTranslate this text. Return ONLY a JSON object with the key "text":\n${JSON.stringify({ text: source }, null, 2)}${feedback}`,
        }],
      });
      const parsed = extractJsonObject(res.text);
      translated = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    } catch (err) {
      console.error(`[translateText ${to}] attempt ${attempt} failed: ${err.message}`);
      previousProblems = describeApiFailure(err);
      continue;
    }

    const check = checkTranslation({
      source: { text: source },
      translated: { text: translated },
      language: to,
      fields: ['text'],
    });
    if (!check.ok) {
      previousProblems = describeProblems(check.problems);
      console.warn(`[translateText ${to}] attempt ${attempt} rejected: ${previousProblems}`);
      continue;
    }

    const verified = await verifyLanguage({ createMessage, label, languageCode: to, translated: { text: translated } });
    if (!verified.ok) {
      previousProblems = verified.problems;
      console.warn(`[translateText ${to}] attempt ${attempt} rejected by language check: ${previousProblems}`);
      continue;
    }

    return { ok: true, text: translated, verified: !verified.unverified };
  }

  return {
    ok: false,
    error: `Translation to ${label} was refused: ${previousProblems || 'no usable translation after two attempts'}`,
  };
}
