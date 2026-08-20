/**
 * Document attribution — who a document row belongs to.
 *
 * Sam Aug 2026: "Wassila puts in a new order, but how do I see it came from
 * her?" The document list showed client / type / amount / date and nothing
 * about the person, so an admin had to go hunting. These tests pin down the
 * label and the search text.
 */

import {
  resolveDocumentAttribution,
  documentAttributionSearchText,
} from '../documentAttribution';

describe('resolveDocumentAttribution', () => {
  test('an agent saving their own order reads as just their name', () => {
    const result = resolveDocumentAttribution({
      creator: { full_name: 'Wassila Mekidiche', email: 'wassila@example.com' },
      agent: { full_name: 'Wassila Mekidiche', email: 'wassila@example.com' },
    });
    expect(result.label).toBe('Wassila Mekidiche');
    expect(result.viaCreator).toBe(false);
  });

  test('an admin entering an order for an agent credits the agent and names the typist', () => {
    const result = resolveDocumentAttribution({
      creator: { full_name: 'Sam Saleh', email: 'sam@example.com' },
      agent: { full_name: 'Ruby Robin', email: 'ruby@example.com' },
    });
    expect(result.label).toBe('Ruby Robin (via Sam Saleh)');
    expect(result.agentName).toBe('Ruby Robin');
    expect(result.creatorName).toBe('Sam Saleh');
    expect(result.viaCreator).toBe(true);
  });

  test('same person with a differently cased name is not reported as "via"', () => {
    const result = resolveDocumentAttribution({
      creator: { full_name: 'wassila mekidiche', email: 'Wassila@Example.com' },
      agent: { full_name: 'Wassila Mekidiche', email: 'wassila@example.com' },
    });
    expect(result.label).toBe('Wassila Mekidiche');
    expect(result.viaCreator).toBe(false);
  });

  test('same name without any email is treated as the same person', () => {
    const result = resolveDocumentAttribution({
      creator: { full_name: 'Caren Melkonian' },
      agent: { full_name: 'Caren Melkonian' },
    });
    expect(result.label).toBe('Caren Melkonian');
    expect(result.viaCreator).toBe(false);
  });

  test('falls back to the email when a profile has no name', () => {
    const result = resolveDocumentAttribution({
      creator: { email: 'ruby@example.com' },
    });
    expect(result.label).toBe('ruby@example.com');
  });

  test('agent alone is enough', () => {
    expect(resolveDocumentAttribution({ agent: { full_name: 'Ruby Robin' } }).label)
      .toBe('Ruby Robin');
  });

  test('a document with no embedded people yields no label instead of throwing', () => {
    expect(resolveDocumentAttribution({}).label).toBeNull();
    expect(resolveDocumentAttribution().label).toBeNull();
    expect(resolveDocumentAttribution({ creator: null, agent: null }).label).toBeNull();
  });

  test('blank names do not produce an empty "via"', () => {
    const result = resolveDocumentAttribution({
      creator: { full_name: '   ', email: '' },
      agent: { full_name: 'Ruby Robin' },
    });
    expect(result.label).toBe('Ruby Robin');
    expect(result.viaCreator).toBe(false);
  });
});

describe('documentAttributionSearchText', () => {
  test('includes both names and both emails so either party is findable', () => {
    const text = documentAttributionSearchText({
      creator: { full_name: 'Sam Saleh', email: 'sam@example.com' },
      agent: { full_name: 'Ruby Robin', email: 'ruby@example.com' },
    });
    expect(text).toContain('sam saleh');
    expect(text).toContain('sam@example.com');
    expect(text).toContain('ruby robin');
    expect(text).toContain('ruby@example.com');
  });

  test('is lowercased so callers can compare against a lowercased query', () => {
    expect(documentAttributionSearchText({ creator: { full_name: 'Wassila Mekidiche' } }))
      .toBe('wassila mekidiche');
  });

  test('returns an empty string for a document with no people', () => {
    expect(documentAttributionSearchText({})).toBe('');
    expect(documentAttributionSearchText()).toBe('');
  });
});
