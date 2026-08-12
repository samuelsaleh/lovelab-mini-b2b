/**
 * lib/analyticsExport.js — row shaping for the Analytics Excel export.
 *
 * The whole point of this export is the contact block (contact name, email,
 * phone, VAT, address), which lives in `metadata.formState` under keys that
 * don't match the column names. Real production data fills those keys
 * unevenly, so the fallbacks matter more than the happy path.
 */

import {
  ANALYTICS_EXPORT_COLUMNS,
  buildAnalyticsExportRows,
  derivePostalAndCity,
  summariseExportRows,
  analyticsExportFilename,
  columnLetter,
} from '../analyticsExport';

const doc = (overrides = {}) => ({
  id: 'doc-1',
  document_type: 'order',
  order_channel: 'b2b',
  total_amount: 1234.5,
  created_at: '2026-03-21T09:30:00.000Z',
  client_company: 'ACME JEWELS',
  client_name: 'Jane Doe',
  events: { name: 'INHORGENTA' },
  metadata: {
    formState: {
      companyName: 'Acme Jewels SARL',
      contactName: 'Jane Doe',
      email: 'jane@acme.example',
      phone: '+33123456789',
      vatNumber: 'FR12345678901',
      addressLine1: '12 Rue de la Paix',
      addressLine2: 'Bat. B',
      postal_code: '75002',
      city: 'Paris',
      country: 'France',
    },
  },
  ...overrides,
});

const rowFor = (overrides) => buildAnalyticsExportRows([doc(overrides)])[0];

describe('ANALYTICS_EXPORT_COLUMNS', () => {
  test('carries the contact fields the Reports export is missing', () => {
    const keys = ANALYTICS_EXPORT_COLUMNS.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['contact', 'email', 'phone', 'vat', 'address', 'postalCode']));
  });

  test('amount is the only numeric column', () => {
    const numeric = ANALYTICS_EXPORT_COLUMNS.filter((c) => c.numeric).map((c) => c.key);
    expect(numeric).toEqual(['amount']);
  });

  test('every column has a header and a width', () => {
    for (const col of ANALYTICS_EXPORT_COLUMNS) {
      expect(col.header).toBeTruthy();
      expect(typeof col.width).toBe('number');
    }
  });
});

describe('buildAnalyticsExportRows', () => {
  test('maps a fully filled order', () => {
    expect(rowFor()).toEqual({
      date: '2026-03-21',
      type: 'order',
      event: 'INHORGENTA',
      company: 'ACME JEWELS',
      contact: 'Jane Doe',
      email: 'jane@acme.example',
      phone: '+33123456789',
      vat: 'FR12345678901',
      address: '12 Rue de la Paix, Bat. B',
      postalCode: '75002',
      city: 'Paris',
      country: 'France',
      channel: 'B2B',
      amount: 1234.5,
    });
  });

  test('keeps one row per document — no deduplication by client', () => {
    const rows = buildAnalyticsExportRows([doc(), doc({ id: 'doc-2' }), doc({ id: 'doc-3' })]);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.company)).size).toBe(1);
  });

  test('preserves the order it was given', () => {
    const rows = buildAnalyticsExportRows([
      doc({ client_company: 'FIRST' }),
      doc({ client_company: 'SECOND' }),
    ]);
    expect(rows.map((r) => r.company)).toEqual(['FIRST', 'SECOND']);
  });
});

describe('buildAnalyticsExportRows — fallbacks on real-world gaps', () => {
  test('falls back to the free-text Event / Fair field when there is no folder', () => {
    const row = rowFor({
      events: null,
      metadata: { formState: { eventName: 'Munich 2026' } },
    });
    expect(row.event).toBe('Munich 2026');
  });

  test('reads eventName from the metadata root when formState has none', () => {
    const row = rowFor({ events: null, metadata: { eventName: 'Nordstil' } });
    expect(row.event).toBe('Nordstil');
  });

  test('the folder wins over the typed fair name', () => {
    const row = rowFor({
      events: { name: 'INHORGENTA' },
      metadata: { formState: { eventName: 'typed something else' } },
    });
    expect(row.event).toBe('INHORGENTA');
  });

  test('says No Event when nothing identifies a fair', () => {
    expect(rowFor({ events: null, metadata: {} }).event).toBe('No Event');
  });

  test('falls back to formState.companyName when the document has no company', () => {
    const row = rowFor({ client_company: '' });
    expect(row.company).toBe('Acme Jewels SARL');
  });

  test('falls back to client_name when no contact name was typed', () => {
    const row = rowFor({
      client_name: 'Fallback Person',
      metadata: { formState: { contactName: '' } },
    });
    expect(row.contact).toBe('Fallback Person');
  });

  test('reads the postal code from zipcode when postal_code is absent', () => {
    const row = rowFor({ metadata: { formState: { zipcode: '20095' } } });
    expect(row.postalCode).toBe('20095');
  });

  test('splits postal code and city out of the second address line', () => {
    // How real orders are actually filled in — see production data.
    const row = rowFor({
      metadata: { formState: { addressLine1: 'Goethestr. 19', addressLine2: '80336 München' } },
    });
    expect(row.postalCode).toBe('80336');
    expect(row.city).toBe('München');
    // The full address column still shows the original text untouched.
    expect(row.address).toBe('Goethestr. 19, 80336 München');
  });

  test('joins only the address lines that exist', () => {
    expect(rowFor({ metadata: { formState: { addressLine1: 'Only one' } } }).address).toBe('Only one');
    expect(rowFor({ metadata: { formState: { addressLine2: 'Only two' } } }).address).toBe('Only two');
    expect(rowFor({ metadata: { formState: {} } }).address).toBe('');
  });

  test('normalises the country and marks blanks as Unknown', () => {
    expect(rowFor({ metadata: { formState: { country: 'germnay' } } }).country).toBe('Germany');
    expect(rowFor({ metadata: { formState: { country: 'uk' } } }).country).toBe('United Kingdom');
    expect(rowFor({ metadata: { formState: {} } }).country).toBe('Unknown');
  });

  test('collapses stray whitespace in text fields', () => {
    const row = rowFor({ client_company: '  ACME   JEWELS  ' });
    expect(row.company).toBe('ACME JEWELS');
  });

  test('handles a document with no metadata at all', () => {
    const row = rowFor({ metadata: null });
    expect(row.email).toBe('');
    expect(row.address).toBe('');
    expect(row.country).toBe('Unknown');
  });

  test('labels each order channel readably', () => {
    expect(rowFor({ order_channel: 'b2c' }).channel).toBe('B2C');
    expect(rowFor({ order_channel: 'consignment' }).channel).toBe('Consignment');
    expect(rowFor({ order_channel: 'delete_from_stock' }).channel).toBe('Write-off');
    expect(rowFor({ order_channel: null }).channel).toBe('B2B');
  });

  test('coerces a missing or unparseable amount to 0', () => {
    expect(rowFor({ total_amount: null }).amount).toBe(0);
    expect(rowFor({ total_amount: 'abc' }).amount).toBe(0);
  });

  test('leaves the date empty rather than printing Invalid Date', () => {
    expect(rowFor({ created_at: null }).date).toBe('');
  });

  test('tolerates a null or non-array input', () => {
    expect(buildAnalyticsExportRows(null)).toEqual([]);
    expect(buildAnalyticsExportRows(undefined)).toEqual([]);
  });
});

describe('derivePostalAndCity', () => {
  test('the explicit fields always win over the parsed address line', () => {
    expect(derivePostalAndCity({ postal_code: '1000', city: 'Brussels', addressLine2: '80336 München' }))
      .toEqual({ postalCode: '1000', city: 'Brussels' });
  });

  test('parses the common European "postcode city" line', () => {
    expect(derivePostalAndCity({ addressLine2: '5081 Anif' })).toEqual({ postalCode: '5081', city: 'Anif' });
    expect(derivePostalAndCity({ addressLine2: '80336 München' })).toEqual({ postalCode: '80336', city: 'München' });
    expect(derivePostalAndCity({ addressLine2: '75002 Paris' })).toEqual({ postalCode: '75002', city: 'Paris' });
  });

  test('keeps a country prefix on the postal code', () => {
    expect(derivePostalAndCity({ addressLine2: 'DE-80336 Munich' }))
      .toEqual({ postalCode: 'DE-80336', city: 'Munich' });
    expect(derivePostalAndCity({ addressLine2: 'l-1234 Ville' }))
      .toEqual({ postalCode: 'L-1234', city: 'Ville' });
  });

  test('handles multi-word city names', () => {
    expect(derivePostalAndCity({ addressLine2: '20121 Milano Centro' }))
      .toEqual({ postalCode: '20121', city: 'Milano Centro' });
  });

  test('fills only the missing half', () => {
    expect(derivePostalAndCity({ city: 'Anif', addressLine2: '5081 Anif' }))
      .toEqual({ postalCode: '5081', city: 'Anif' });
    expect(derivePostalAndCity({ postal_code: '5081', addressLine2: '9999 Elsewhere' }))
      .toEqual({ postalCode: '5081', city: 'Elsewhere' });
  });

  test('refuses to guess when the line is not a postcode + city', () => {
    for (const addressLine2 of ['Bat. B', '2nd floor', '', '12 Rue de la Paix', '80336']) {
      expect(derivePostalAndCity({ addressLine2 })).toEqual({ postalCode: '', city: '' });
    }
  });

  test('takes a bare city with no postcode — the line is labelled "Postal code, City"', () => {
    expect(derivePostalAndCity({ addressLine2: 'München' })).toEqual({ postalCode: '', city: 'München' });
  });

  test('tolerates no argument', () => {
    expect(derivePostalAndCity()).toEqual({ postalCode: '', city: '' });
  });
});

describe('summariseExportRows', () => {
  const rows = [
    { type: 'order', company: 'ACME', amount: 100 },
    { type: 'order', company: 'acme', amount: 50 },
    { type: 'quote', company: 'BIJOUX', amount: 999 },
    { type: 'order', company: '', amount: 25 },
  ];

  test('revenue counts orders only, never quotes', () => {
    expect(summariseExportRows(rows).revenue).toBe(175);
  });

  test('counts orders and quotes separately', () => {
    const s = summariseExportRows(rows);
    expect(s.orderCount).toBe(3);
    expect(s.quoteCount).toBe(1);
    expect(s.rowCount).toBe(4);
  });

  test('client count is case-insensitive and ignores blanks', () => {
    expect(summariseExportRows(rows).clientCount).toBe(2);
  });

  test('handles an empty list', () => {
    expect(summariseExportRows([])).toEqual({
      revenue: 0, orderCount: 0, quoteCount: 0, clientCount: 0, rowCount: 0,
    });
  });
});

describe('analyticsExportFilename', () => {
  const now = new Date('2026-08-12T12:00:00.000Z');

  test('includes the fair name and the channel', () => {
    expect(analyticsExportFilename({ eventName: 'INHORGENTA', channelScope: 'b2b', now }))
      .toBe('LoveLab_Analytics_INHORGENTA_B2B_2026-08-12.xlsx');
  });

  test('omits the channel when all channels are shown', () => {
    expect(analyticsExportFilename({ eventName: 'Nordstil', channelScope: 'all', now }))
      .toBe('LoveLab_Analytics_Nordstil_2026-08-12.xlsx');
  });

  test('omits the fair when no event is selected', () => {
    expect(analyticsExportFilename({ eventName: '', channelScope: 'all', now }))
      .toBe('LoveLab_Analytics_2026-08-12.xlsx');
  });

  test('strips characters that break filenames', () => {
    const name = analyticsExportFilename({ eventName: 'Tari jewelry / Napoli show!', channelScope: 'all', now });
    expect(name).toBe('LoveLab_Analytics_Tari_jewelry_Napoli_show_2026-08-12.xlsx');
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
  });

  test('works with no arguments at all', () => {
    expect(analyticsExportFilename()).toMatch(/^LoveLab_Analytics_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

describe('columnLetter', () => {
  test('handles the 14 columns this export uses and beyond', () => {
    expect(columnLetter(1)).toBe('A');
    expect(columnLetter(14)).toBe('N');
    expect(columnLetter(26)).toBe('Z');
    expect(columnLetter(27)).toBe('AA');
    expect(columnLetter(52)).toBe('AZ');
  });
});
