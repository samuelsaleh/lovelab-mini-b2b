/**
 * @jest-environment node
 *
 * The AI advisor's system prompt embeds a literal price table that the model
 * uses to quote. After the 2025/2026 toggle ships, this table MUST be
 * regenerated per request — otherwise the AI quotes the wrong year and a
 * salesperson at a fair has no idea why their numbers don't match the builder.
 */

import { buildPricesBlock, buildSystemPrompt, SYSTEM_PROMPT } from '../prompt.js';

describe('buildPricesBlock', () => {
  test('2025 uses 2025 numbers — CUTY 0.05 In-house @ €20', () => {
    const block = buildPricesBlock('2025');
    expect(block).toContain('0.05=€20');
  });

  test('2026 uses 2026 numbers — CUTY 0.05 In-house @ €24', () => {
    const block = buildPricesBlock('2026');
    expect(block).toContain('0.05=€24');
  });

  test('2025 block does NOT contain the 2026-only price for CUTY 0.30 IGI', () => {
    // 2025 = €90, 2026 = €100. The 2025 block must mention 90 and not 100
    // for that specific (collection, carat) pair.
    const block25 = buildPricesBlock('2025');
    expect(block25).toContain('CUTY (IGI):');
    // Cheap line-level scan rather than regex parsing the whole block
    const cutyLine = block25.split('\n').find((l) => l.startsWith('CUTY (IGI):'));
    expect(cutyLine).toContain('0.30=€90');
    expect(cutyLine).not.toContain('0.30=€100');
  });

  test('2026 CUTY (IGI) line contains €100, not €90, for 0.30', () => {
    const block26 = buildPricesBlock('2026');
    const cutyLine = block26.split('\n').find((l) => l.startsWith('CUTY (IGI):'));
    expect(cutyLine).toContain('0.30=€100');
    expect(cutyLine).not.toContain('0.30=€90');
  });

  test('CUTY In-house line skips carats that are null (0.20, 0.30 are unavailable)', () => {
    const block = buildPricesBlock('2025');
    const inhouseLine = block.split('\n').find((l) => l.startsWith('CUTY (In-house'));
    expect(inhouseLine).toBeDefined();
    // Must mention 0.05 and 0.10
    expect(inhouseLine).toContain('0.05=');
    expect(inhouseLine).toContain('0.10=');
    // But NOT 0.20 or 0.30 (no in-house cert at those carats)
    expect(inhouseLine).not.toContain('0.20=');
    expect(inhouseLine).not.toContain('0.30=');
  });

  test('HOLY identical in both years', () => {
    const line25 = buildPricesBlock('2025').split('\n').find((l) => l.startsWith('HOLY'));
    const line26 = buildPricesBlock('2026').split('\n').find((l) => l.startsWith('HOLY'));
    expect(line25).toBe(line26);
  });

  test('2026 Flower Heart (IGI) reflects updated Iconix price', () => {
    const block = buildPricesBlock('2026', true);
    const line = block.split('\n').find((l) => l.startsWith('Flower Heart (IGI only):'));
    expect(line).toContain('0.40=€150/€585');
  });

  test('invalid year falls back to default (2026)', () => {
    expect(buildPricesBlock('2024')).toBe(buildPricesBlock('2026'));
    expect(buildPricesBlock(undefined)).toBe(buildPricesBlock('2026'));
  });

  // The October list only reprices Moonlight / Sienna / Za-Ha, so the AI must
  // quote the new numbers there while leaving every classic collection alone.
  describe('October 2026 list', () => {
    test('Sienna One quotes the October prices', () => {
      const oct = buildPricesBlock('2026-10', true).split('\n').find((l) => l.startsWith('Sienna One'));
      expect(oct).toContain('0.10=€121/€475');
      expect(oct).toContain('0.30=€172/€675');
    });

    test('sizes retired in October are absent from every list', () => {
      for (const year of ['2025', '2026', '2026-10']) {
        const line = buildPricesBlock(year, true).split('\n').find((l) => l.startsWith('Sienna One'));
        expect(line).not.toContain('0.20=');
      }
    });

    test('October-only sizes never leak into the 2026 block', () => {
      const label = 'Multi Moonlight (IGI only):';
      const oct = buildPricesBlock('2026-10', true).split('\n').find((l) => l.startsWith(label));
      const y26 = buildPricesBlock('2026', true).split('\n').find((l) => l.startsWith(label));
      expect(oct).toContain('0.70=€200/€650');
      expect(oct).toContain('1.10=€320/€960');
      expect(y26).not.toContain('0.70=');
      expect(y26).not.toContain('1.10=');
    });

    test('classic collections read the same on October as on 2026', () => {
      const lineFor = (year, prefix) =>
        buildPricesBlock(year, true).split('\n').find((l) => l.startsWith(prefix));
      for (const prefix of ['CUTY (IGI):', 'MULTI THREE', 'SHAPY SHINE FANCY', 'CUTY NECKLACE']) {
        expect(lineFor('2026-10', prefix)).toBe(lineFor('2026', prefix));
      }
    });
  });
});

describe('buildSystemPrompt', () => {
  test('embeds the year-specific prices block', () => {
    const p25 = buildSystemPrompt('2025');
    const p26 = buildSystemPrompt('2026');
    expect(p25).toContain(buildPricesBlock('2025'));
    expect(p26).toContain(buildPricesBlock('2026'));
  });

  test('the two prompts differ (proves swap happens cleanly)', () => {
    expect(buildSystemPrompt('2025')).not.toBe(buildSystemPrompt('2026'));
  });

  test('legacy SYSTEM_PROMPT constant equals buildSystemPrompt(default)', () => {
    expect(SYSTEM_PROMPT).toBe(buildSystemPrompt('2026'));
  });
});
