/**
 * @jest-environment node
 *
 * lib/commissionSearch — the search box over commission rows.
 */

const { commissionMatchesQuery, commissionSearchText } = require('../commissionSearch.js');

const row = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  document_id: '674dd111-e507-4acf-a64f-a2640ba7c590',
  client_label: null,
  invoice_number: '260318',
  document: {
    id: '674dd111-e507-4acf-a64f-a2640ba7c590',
    client_company: 'BIJOUTERIE CURIOZA',
    client_name: 'Estelle Léger',
    file_name: 'BIJOUTERIE_CURIOZA_Order_2026-10-20_674dd111-e507-4acf-a64f-a2640ba7c590.pdf',
    metadata: { order_number: 'WEB-10234', formState: { contactName: 'Estelle Léger', companyName: 'Bijouterie Curioza' } },
  },
};

describe('commissionMatchesQuery', () => {
  test('empty query matches everything', () => {
    expect(commissionMatchesQuery(row, '')).toBe(true);
    expect(commissionMatchesQuery(row, '   ')).toBe(true);
    expect(commissionMatchesQuery(null, 'x')).toBe(false);
  });

  test('customer company, contact name, case and accents', () => {
    expect(commissionMatchesQuery(row, 'curioza')).toBe(true);
    expect(commissionMatchesQuery(row, 'estelle leger')).toBe(true);
    expect(commissionMatchesQuery(row, 'LÉGER')).toBe(true);
  });

  test('invoice number, website order number, document id fragment', () => {
    expect(commissionMatchesQuery(row, '260318')).toBe(true);
    expect(commissionMatchesQuery(row, '2603')).toBe(true);
    expect(commissionMatchesQuery(row, 'web-10234')).toBe(true);
    expect(commissionMatchesQuery(row, '674dd111')).toBe(true);
  });

  test('every word must match', () => {
    expect(commissionMatchesQuery(row, 'curioza 2603')).toBe(true);
    expect(commissionMatchesQuery(row, 'curioza 9999')).toBe(false);
    expect(commissionMatchesQuery(row, 'topaze')).toBe(false);
  });

  test('quick orders and bonuses search on their label', () => {
    const quick = { id: 'q1', type: 'order', client_label: 'Cloe By Stéphany', invoice_number: null, document: null };
    expect(commissionMatchesQuery(quick, 'stephany')).toBe(true);
    expect(commissionSearchText(quick)).toContain('cloe by stephany');
  });
});
