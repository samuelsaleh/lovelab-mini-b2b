/**
 * Reading a city back out of the free-text address lines.
 *
 * A wrong city is worse than a missing one: it splits one shop across two
 * rows in every report. So the interesting half of these tests is what the
 * parser REFUSES to claim.
 */

import { derivePostalAndCity, deriveCity, cityFoldKey, buildCityLabels } from '../clientAddress';

const city = (formState) => derivePostalAndCity(formState).city;

describe('the dedicated fields', () => {
  test('win when both are filled', () => {
    expect(derivePostalAndCity({ postal_code: '1000', city: 'Brussels', addressLine2: '80336 München' }))
      .toEqual({ postalCode: '1000', city: 'Brussels' });
  });

  test('zipcode is accepted as a spelling of postal_code', () => {
    expect(derivePostalAndCity({ zipcode: '1000', city: 'Brussels' }))
      .toEqual({ postalCode: '1000', city: 'Brussels' });
  });

  test('a postcode typed into the city field is treated as a postcode', () => {
    // Real data: a row showing "66706" in the City column of Admin → Reports.
    expect(derivePostalAndCity({ city: '66706' })).toEqual({ postalCode: '66706', city: '' });
  });

  test('and the real city is still recovered from the address line', () => {
    expect(derivePostalAndCity({ city: '66706', addressLine2: '66706 Perl' }))
      .toEqual({ postalCode: '66706', city: 'Perl' });
  });

  test('the legacy `location` key still counts as a city', () => {
    expect(city({ location: 'Antwerp' })).toBe('Antwerp');
  });

  test('only the missing half is filled in', () => {
    expect(derivePostalAndCity({ city: 'Anif', addressLine2: '5081 Anif' }))
      .toEqual({ postalCode: '5081', city: 'Anif' });
    expect(derivePostalAndCity({ postal_code: '5081', addressLine2: '9999 Elsewhere' }))
      .toEqual({ postalCode: '5081', city: 'Elsewhere' });
  });
});

describe('postcode followed by city', () => {
  test('the everyday European format', () => {
    expect(derivePostalAndCity({ addressLine2: '5081 Anif' })).toEqual({ postalCode: '5081', city: 'Anif' });
    expect(derivePostalAndCity({ addressLine2: '80336 München' })).toEqual({ postalCode: '80336', city: 'München' });
    expect(derivePostalAndCity({ addressLine2: '75002 Paris' })).toEqual({ postalCode: '75002', city: 'Paris' });
  });

  test('a comma between the two', () => {
    expect(derivePostalAndCity({ addressLine2: '80336, München' }))
      .toEqual({ postalCode: '80336', city: 'München' });
  });

  test('a country prefix is kept on the postcode', () => {
    expect(derivePostalAndCity({ addressLine2: 'DE-80336 Munich' }))
      .toEqual({ postalCode: 'DE-80336', city: 'Munich' });
    expect(derivePostalAndCity({ addressLine2: 'l-1234 Ville' }))
      .toEqual({ postalCode: 'L-1234', city: 'Ville' });
  });

  test('multi-word cities survive', () => {
    expect(derivePostalAndCity({ addressLine2: '20121 Milano Centro' }))
      .toEqual({ postalCode: '20121', city: 'Milano Centro' });
  });

  test('extra whitespace is collapsed', () => {
    expect(derivePostalAndCity({ addressLine2: '  80336   München  ' }))
      .toEqual({ postalCode: '80336', city: 'München' });
  });

  test('a Dutch postcode keeps its two letters, attached or loose', () => {
    expect(derivePostalAndCity({ addressLine2: '7126AX Bredevoort' }))
      .toEqual({ postalCode: '7126AX', city: 'Bredevoort' });
    expect(derivePostalAndCity({ addressLine2: '1181 KK Amstelveen' }))
      .toEqual({ postalCode: '1181 KK', city: 'Amstelveen' });
  });

  test('but a two-letter word of the city name is not a Dutch postcode', () => {
    expect(derivePostalAndCity({ addressLine2: '76600 Le Havre' }))
      .toEqual({ postalCode: '76600', city: 'Le Havre' });
    expect(derivePostalAndCity({ addressLine2: '43000 LE PUY EN VELAY' }))
      .toEqual({ postalCode: '43000', city: 'LE PUY EN VELAY' });
  });

  test('a postcode written with a space in it', () => {
    // Slovak, Czech and Polish postcodes: "984 01 Lučenec".
    expect(derivePostalAndCity({ addressLine2: '984 01 Lučenec' }))
      .toEqual({ postalCode: '984 01', city: 'Lučenec' });
  });

  test('the street tacked on after the city is dropped', () => {
    // Real data: "4563 Micheldorf Gratenstrasse 27".
    expect(derivePostalAndCity({ addressLine2: '4563 Micheldorf Gratenstrasse 27' }))
      .toEqual({ postalCode: '4563', city: 'Micheldorf' });
  });

  test('a postcode with only a street after it gives no city', () => {
    expect(derivePostalAndCity({ addressLine2: '75001 Rue de Rivoli' }))
      .toEqual({ postalCode: '75001', city: '' });
  });

  test('masked or garbled text is not a city', () => {
    expect(city({ addressLine2: '12345 COR**********' })).toBe('');
  });
});

describe('city followed by postcode', () => {
  test('the reversed format is understood', () => {
    expect(derivePostalAndCity({ addressLine2: 'Anif 5081' })).toEqual({ postalCode: '5081', city: 'Anif' });
    expect(derivePostalAndCity({ addressLine2: 'München, 80336' }))
      .toEqual({ postalCode: '80336', city: 'München' });
  });

  test('but a street with a house number is not a city', () => {
    expect(city({ addressLine2: 'Lange Strasse 55' })).toBe('');
    expect(city({ addressLine2: 'Bahnhofstr. 12' })).toBe('');
  });
});

describe('a bare city with no postcode', () => {
  test('is accepted — the form line is labelled "Postal code, City"', () => {
    // Real data: SCHATZ IM GLUECK typed only "Lippstadt".
    expect(derivePostalAndCity({ addressLine2: 'Lippstadt' })).toEqual({ postalCode: '', city: 'Lippstadt' });
    expect(city({ addressLine2: 'Frankfurt am Main' })).toBe('Frankfurt am Main');
  });

  test('but never a street name', () => {
    for (const line of ['Bahnhofstrasse', 'Rue de la Paix', 'Grote Markt straat', 'Via Roma', 'Kerkweg']) {
      expect(city({ addressLine2: line })).toBe('');
    }
  });

  test('and never a building or floor', () => {
    for (const line of ['Bat. B', 'Batiment C', 'Building A', 'Etage 3', 'PO Box', 'c/o Meyer', 'Suite D']) {
      expect(city({ addressLine2: line })).toBe('');
    }
  });

  test('and never a one-letter fragment', () => {
    expect(city({ addressLine2: 'B' })).toBe('');
    expect(city({ addressLine2: 'A B' })).toBe('');
  });

  test('and never something absurdly long', () => {
    expect(city({ addressLine2: 'x'.repeat(41) })).toBe('');
  });
});

describe('the two address lines get swapped', () => {
  test('the first line is read when the second one is the street', () => {
    // Real data: Schatz has "59555 Lippstadt" in line 1 and the street in line 2.
    expect(derivePostalAndCity({ addressLine1: '59555 Lippstadt', addressLine2: 'Lange Strasse 55' }))
      .toEqual({ postalCode: '59555', city: 'Lippstadt' });
  });

  test('the second line still wins when both could be read', () => {
    expect(city({ addressLine1: '1000 Brussels', addressLine2: '80336 München' })).toBe('München');
  });

  test('the normal layout is unaffected', () => {
    expect(derivePostalAndCity({ addressLine1: 'Hauptstrasse 12', addressLine2: '80336 München' }))
      .toEqual({ postalCode: '80336', city: 'München' });
  });
});

describe('nothing to work with', () => {
  test('empty, missing and malformed input', () => {
    expect(derivePostalAndCity()).toEqual({ postalCode: '', city: '' });
    expect(derivePostalAndCity({})).toEqual({ postalCode: '', city: '' });
    expect(derivePostalAndCity({ addressLine1: '', addressLine2: '   ' })).toEqual({ postalCode: '', city: '' });
    expect(derivePostalAndCity({ city: null, addressLine2: undefined })).toEqual({ postalCode: '', city: '' });
  });

  test('a postcode on its own gives no city', () => {
    expect(city({ addressLine2: '80336' })).toBe('');
  });

  test('a house number is not a postcode', () => {
    expect(derivePostalAndCity({ addressLine2: '12 Rue de la Paix' })).toEqual({ postalCode: '', city: '' });
  });
});

describe('deriveCity', () => {
  test('is the city half, and empty when unknown', () => {
    expect(deriveCity({ addressLine2: '80336 München' })).toBe('München');
    expect(deriveCity({})).toBe('');
    expect(deriveCity()).toBe('');
  });
});

describe('cityFoldKey', () => {
  test('collapses case, accents and punctuation', () => {
    expect(cityFoldKey('LYON')).toBe(cityFoldKey('Lyon'));
    expect(cityFoldKey('München')).toBe(cityFoldKey('Munchen'));
    expect(cityFoldKey('Bar-le-Duc')).toBe(cityFoldKey('BAR LE DUC'));
    expect(cityFoldKey('Asnières-Sur-Seine')).toBe(cityFoldKey('Asnières-sur-Seine'));
  });

  test('keeps genuinely different places apart', () => {
    expect(cityFoldKey('Lyon')).not.toBe(cityFoldKey('Lille'));
    expect(cityFoldKey('Bonn')).not.toBe(cityFoldKey('Bonne'));
  });

  test('survives empty input', () => {
    expect(cityFoldKey('')).toBe('');
    expect(cityFoldKey(null)).toBe('');
  });
});

describe('buildCityLabels', () => {
  const labelFor = (cities, lookup) => buildCityLabels(cities).get(cityFoldKey(lookup));

  test('prefers the accented spelling', () => {
    expect(labelFor(['Munchen', 'Munchen', 'München'], 'munchen')).toBe('München');
  });

  test('prefers normal capitalisation over shouting', () => {
    expect(labelFor(['LYON', 'LYON', 'LYON', 'Lyon'], 'lyon')).toBe('Lyon');
    expect(labelFor(['hamburg', 'Hamburg'], 'hamburg')).toBe('Hamburg');
  });

  test('falls back to the most common spelling', () => {
    expect(labelFor(['PARIS', 'PARIS', 'LYON'], 'paris')).toBe('PARIS');
  });

  test('leaves a lone spelling exactly as typed', () => {
    expect(labelFor(['BALMA'], 'balma')).toBe('BALMA');
  });

  test('is stable whichever order the data arrives in', () => {
    const a = labelFor(['Lyon', 'LYON'], 'lyon');
    const b = labelFor(['LYON', 'Lyon'], 'lyon');
    expect(a).toBe(b);
  });

  test('ignores blanks', () => {
    const labels = buildCityLabels(['', '   ', null, undefined, 'Lyon']);
    expect(labels.size).toBe(1);
    expect(labels.get('lyon')).toBe('Lyon');
  });
});
