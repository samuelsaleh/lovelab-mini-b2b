/**
 * Pulling a postcode and a city out of what people actually typed.
 *
 * The order form has no city field. It has two free address lines, and the
 * second one is labelled "Postal code, City", so the city almost always ends
 * up inside a string like "80336 München" instead of in `formState.city`.
 * Anything that wants to group orders by city has to read it back out.
 *
 * The rules below are deliberately conservative: a value is only claimed as a
 * city when the line can't reasonably be a street. When in doubt we return
 * nothing and the caller falls back to "Unknown", because a wrong city is
 * worse than a missing one — it silently splits a client across two rows.
 */

const clean = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ');
};

/** Prefer the first non-empty candidate. */
const firstOf = (...candidates) => {
  for (const c of candidates) {
    const v = clean(c);
    if (v) return v;
  }
  return '';
};

// A postcode as written across our markets: "5081", "80336", "7126AX" (NL),
// "984 01" (SK/CZ), optionally with a country prefix — "DE-80336", "L-1234".
const POSTCODE = String.raw`(?:[A-Za-z]{1,2}-)?(?:\d{4,6}[A-Za-z]{0,2}|\d{2,3}\s\d{2,3})`;

// "5081 Anif", "80336, München", "DE-80336 Munich".
const POSTAL_FIRST = new RegExp(`^(${POSTCODE})[,\\s]\\s*(.{2,})$`);

// The same thing written the other way round: "Anif 5081".
const POSTAL_LAST = new RegExp(`^(.{2,}?)[,\\s]\\s*(${POSTCODE})$`);

// "1234 KK Amstelveen" — the letter half of a Dutch postcode, split off by a
// space. Only ever two capitals after exactly four digits, so it can't eat
// the "Le" of "75002 Le Havre".
const DUTCH_LETTERS = /^(\d{4})\s([A-Z]{2})$/;

// If any of these appear, the line is a street and holds no city we can trust.
const STREET_TOKENS = /(?:^|[\s.])(?:str|straat|strasse|straße|stra|weg|laan|allee|platz|gasse|rue|avenue|av|boulevard|bd|chemin|route|rte|road|rd|street|lane|drive|via|piazza|corso|calle|plaza)(?:$|[\s.,])/i;

// Letters, spaces and the punctuation that shows up in real place names —
// "Cava de' Tirreni", "Luzzara (RE)", "Noirmoutier-en-l'Île", "София".
const CITY_CHARS = /^[\p{L}\p{M}\s'’.()\-\/]+$/u;

// Dutch and German street names are one compound word — Bahnhofstrasse,
// Kerkweg, Marktplatz — so the token list above never sees them.
const STREET_SUFFIX = /(?:strasse|straße|straat|str|weg|laan|allee|platz|plein|gasse|dreef|kade|singel|dijk|steenweg|ring)\.?$/i;

// Address complements people put on the second line instead of a city.
const COMPLEMENT_TOKENS = /(?:^|[\s.])(?:bat|batiment|bâtiment|bldg|building|floor|etage|étage|apt|app|appartement|suite|unit|block|bloc|hall|stand|booth|box|bus|c\/o|po)(?:$|[\s.,])/i;

/**
 * A line we can read a bare city off, e.g. someone who typed just
 * "Lippstadt". No digits, no street or building wording, and no one-letter
 * token — "Bat. B" is a building, not a place.
 */
function looksLikeBareCity(line) {
  if (!line || line.length < 3 || line.length > 40) return false;
  if (/\d/.test(line)) return false;
  if (STREET_TOKENS.test(line) || COMPLEMENT_TOKENS.test(line)) return false;
  if (!CITY_CHARS.test(line)) return false;
  return line
    .split(/[\s,]+/)
    .every((token) => token.replace(/\./g, '').length >= 2 && !STREET_SUFFIX.test(token));
}

// "de-80336" reads as "DE-80336", "7126ax" as "7126AX".
const formatPostcode = (raw) => clean(raw).toUpperCase();

/**
 * Keep the place name and drop whatever the person appended to it. People
 * write the whole address on one line — "4563 Micheldorf Gratenstrasse 27" —
 * so everything from the first street word or house number onwards goes.
 */
function cityFromRemainder(raw) {
  const tokens = clean(raw).split(' ');
  const kept = [];
  for (const token of tokens) {
    if (/\d/.test(token) || STREET_SUFFIX.test(token)) break;
    kept.push(token);
  }
  const city = kept.join(' ').replace(/[,;]+$/, '').trim();
  if (city.length < 2 || city.length > 40) return '';
  if (STREET_TOKENS.test(city) || !CITY_CHARS.test(city)) return '';
  return city;
}

function parseLine(line) {
  const value = clean(line);
  if (!value) return null;

  const first = POSTAL_FIRST.exec(value);
  if (first) {
    let [, postcode, rest] = first;
    const dutch = /^([A-Z]{2})\s+(.+)$/.exec(clean(rest));
    if (dutch && DUTCH_LETTERS.test(`${postcode} ${dutch[1]}`)) {
      postcode = `${postcode} ${dutch[1]}`;
      rest = dutch[2];
    }
    return { postalCode: formatPostcode(postcode), city: cityFromRemainder(rest) };
  }

  const last = POSTAL_LAST.exec(value);
  if (last) {
    const [, rest, postcode] = last;
    const city = cityFromRemainder(rest);
    return city ? { postalCode: formatPostcode(postcode), city } : null;
  }

  if (looksLikeBareCity(value)) return { postalCode: '', city: value };
  return null;
}

/**
 * Best effort postcode + city for one order's `metadata.formState`.
 *
 * Reads the dedicated fields first, then the second address line (labelled
 * "Postal code, City" in the form), then the first one — people do swap them.
 * A dedicated city field holding nothing but digits is treated as a postcode,
 * because that is what it is.
 *
 * @param {object} formState
 * @returns {{ postalCode: string, city: string }} empty strings when unknown
 */
export function derivePostalAndCity(formState = {}) {
  const rawCity = firstOf(formState.city, formState.location);
  const cityIsPostcode = /^\d{4,6}$/.test(rawCity);

  let postalCode = firstOf(formState.postal_code, formState.zipcode, cityIsPostcode ? rawCity : '');
  let city = cityIsPostcode ? '' : rawCity;
  if (postalCode && city) return { postalCode, city };

  for (const line of [formState.addressLine2, formState.addressLine1]) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    postalCode = postalCode || parsed.postalCode;
    city = city || parsed.city;
    if (postalCode && city) break;
  }

  return { postalCode, city };
}

/**
 * The city to show in a table or filter, or '' when we genuinely don't know.
 * Callers decide how to label the gap.
 */
export function deriveCity(formState = {}) {
  return derivePostalAndCity(formState).city;
}

/**
 * One key per place, whatever the typing. "LYON", "Lyon" and "lyon" share a
 * key; so do "München" and "Munchen", and "Bar-le-Duc" and "BAR LE DUC".
 */
export function cityFoldKey(city) {
  return clean(city)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Accented and properly capitalised beats SHOUTING and beats all lowercase. */
function labelScore(city) {
  const hasAccents = /\p{M}/u.test(city.normalize('NFD')) ? 2 : 0;
  const letters = city.replace(/[^\p{L}]/gu, '');
  const mixedCase = letters && letters !== letters.toUpperCase() && letters !== letters.toLowerCase() ? 1 : 0;
  return hasAccents + mixedCase;
}

/**
 * Pick one spelling per place so a city shows up once in a filter instead of
 * three times. Nothing is invented: the winner is always a spelling somebody
 * actually typed.
 *
 * @param {Iterable<string>} cities every city value in the data, duplicates included
 * @returns {Map<string, string>} fold key → the spelling to display
 */
export function buildCityLabels(cities) {
  const counts = new Map();
  for (const raw of cities) {
    const city = clean(raw);
    if (!city) continue;
    const key = cityFoldKey(city);
    if (!key) continue;
    const bucket = counts.get(key) || new Map();
    bucket.set(city, (bucket.get(city) || 0) + 1);
    counts.set(key, bucket);
  }

  const labels = new Map();
  for (const [key, bucket] of counts) {
    const best = [...bucket.entries()].sort((a, b) => {
      const score = labelScore(b[0]) - labelScore(a[0]);
      if (score) return score;
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })[0][0];
    labels.set(key, best);
  }
  return labels;
}
