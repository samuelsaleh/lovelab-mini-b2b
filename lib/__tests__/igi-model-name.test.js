/**
 * Model names are written one way.
 *
 * Sam, 11 Sept 2026, after seeing "Multi Moonlight" next to "MULTI MOONLIGHT":
 * digits not words, each word capitalised, products separated by " / ", the
 * shape in the name for Shapy Shine and Matchy Fancy.
 */
const { formatModelName, isFormattedModelName } = require('../igi/modelName');
const seed = require('../igi/seed.json');
const renames = require('../igi/modelRenames.json');

describe('formatModelName', () => {
  test.each([
    ['MULTI MOONLIGHT', 'Multi Moonlight'],
    ['multi moonlight', 'Multi Moonlight'],
    ['  Multi   Moonlight ', 'Multi Moonlight'],
    ['ZAHA', 'Zaha'],
    ['FLOWER MARQUISE', 'Flower Marquise'],
    ['Multi Three', 'Multi 3'],
    ['Linea five', 'Linea 5'],
    ['Riviera Eight', 'Riviera 8'],
    ['Cuty/Cubix/Sienna 1', 'Cuty / Cubix / Sienna 1'],
    ['Multi 4 /Sienna 4/ Riviera 4', 'Multi 4 / Sienna 4 / Riviera 4'],
    ['za-ha', 'Za-Ha'],
    ['Shapy Shine LONG CUSHION', 'Shapy Shine Long Cushion'],
  ])('%s → %s', (typed, saved) => {
    expect(formatModelName(typed)).toBe(saved);
  });

  test('short codes and numbers pass through untouched', () => {
    expect(formatModelName('Holy D VVS')).toBe('Holy D VVS');
    expect(formatModelName('A')).toBe('A');
    expect(formatModelName('6+1 Halo')).toBe('6+1 Halo');
    expect(formatModelName('—')).toBe('—');
  });

  test('is idempotent, and empty input stays empty', () => {
    for (const s of ['Multi 3', 'Cuty / Cubix / Long Moonlight', 'Shapy Shine Pear']) {
      expect(formatModelName(formatModelName(s))).toBe(s);
    }
    expect(formatModelName('')).toBe('');
    expect(formatModelName('   ')).toBe('');
    expect(formatModelName(' / / ')).toBe('');
    expect(formatModelName(null)).toBe('');
  });

  test('isFormattedModelName says whether a name already reads that way', () => {
    expect(isFormattedModelName('Multi 3')).toBe(true);
    expect(isFormattedModelName('MULTI 3')).toBe(false);
    expect(isFormattedModelName('')).toBe(false);
  });
});

describe('the seed', () => {
  test('every model name is already in the house format', () => {
    const off = seed.models.filter((m) => !isFormattedModelName(m.name));
    expect(off.map((m) => `${m.serial || '(waiting)'}: ${m.name}`)).toEqual([]);
  });

  test("uses Sam's names", () => {
    const byName = new Map(seed.models.filter((m) => m.serial).map((m) => [m.serial, m.name]));
    expect(byName.get('LGAJ6529')).toBe('Cuty / Cubix / Long Moonlight');
    expect(byName.get('LGAJ6537')).toBe('Multi 4 / Sienna 4 / Riviera 4');
    expect(byName.get('LGAJ6538')).toBe('Multi 4 / Sienna 4 / Riviera 4');
    expect(byName.get('LGAJ6533')).toBe('Multi 3');
    expect(byName.get('LGAJ6567')).toBe('Multi Moonlight');
    expect(byName.get('LGAJ6568')).toBe('Zaha');
    expect(byName.get('LGAJ6569')).toBe('Flower Marquise');
    expect(byName.get('LGAJ6570')).toBe('Flower Heart');
    expect(byName.get('LGAJ6571')).toBe('Linea 3');
    expect(byName.get('LGAJ6572')).toBe('Linea 5');
    expect(byName.get('LGAJ6574')).toBe('Riviera 8');
    expect(byName.get('LGAJ6575')).toBe('Riviera 8');
  });

  test('Shapy Shine and Matchy Fancy carry their shape', () => {
    for (const m of seed.models) {
      if (/^(Shapy Shine|Matchy Fancy)/.test(m.name)) {
        expect(m.name).toBe(`${m.name.startsWith('Shapy') ? 'Shapy Shine' : 'Matchy Fancy'} ${m.shape}`);
      }
    }
  });

  test("IGI's own name is kept beside ours", () => {
    const byName = new Map(seed.models.filter((m) => m.serial).map((m) => [m.serial, m.igi_name]));
    expect(byName.get('LGAJ6566')).toBe('HALO');
    expect(byName.get('LGAJ6569')).toBe('LUMA');
    expect(byName.get('LGAJ6570')).toBe('LUVA');
  });
});

describe('the rename list, which corrects a database that already holds the old names', () => {
  test('each entry points at a seeded serial and lands on its current name', () => {
    const bySerial = new Map(seed.models.filter((m) => m.serial).map((m) => [m.serial, m]));
    expect(renames.renames.length).toBeGreaterThan(50);
    for (const r of renames.renames) {
      expect(bySerial.get(r.serial)?.name).toBe(r.to);
      expect(r.from).not.toBe(r.to);
      expect(isFormattedModelName(r.to)).toBe(true);
    }
  });
});
