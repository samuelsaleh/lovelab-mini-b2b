/**
 * One way of writing a model's name.
 *
 * Sam, 11 Sept 2026, after seeing "Multi Moonlight" and "MULTI MOONLIGHT" on
 * neighbouring rows: names are written the same way everywhere.
 *
 *   - Each word starts with a capital, the rest is small: "Shapy Shine Pear",
 *     "Zaha", "Flower Marquise". Not "ZAHA", not "FLOWER MARQ".
 *   - Numbers are digits, not words: "Multi 3", "Linea 5", "Riviera 8".
 *   - When a certificate serves several products, the products are separated
 *     by " / " with a space either side: "Cuty / Cubix / Sienna 1". Never a
 *     hyphen, never a bare slash.
 *   - Shapy Shine and Matchy Fancy carry the shape in the name, so the row can
 *     be recognised without reading the spec column.
 *
 * formatModelName applies the first three rules to whatever is typed, so a
 * name saved from the Models screen comes out in this shape whatever the
 * keyboard did. The fourth is a naming choice, made in the seed.
 */

const NUMBER_WORDS = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', twelve: '12',
};

/** Short all-caps words are initials or codes (VVS, ML, D) — left alone. */
function titleWord(word) {
  if (!word) return word;
  if (/^[A-Z]{1,3}$/.test(word)) return word;
  if (/^[0-9.,+]+$/.test(word)) return word;
  const spelled = NUMBER_WORDS[word.toLowerCase()];
  if (spelled) return spelled;
  return word
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
    .join('-');
}

export function formatModelName(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .split('/')
    .map((product) => product.trim().split(/\s+/).filter(Boolean).map(titleWord).join(' '))
    .filter(Boolean)
    .join(' / ');
}

/** True when a name already reads the way formatModelName would write it. */
export function isFormattedModelName(name) {
  return typeof name === 'string' && name.length > 0 && formatModelName(name) === name;
}
