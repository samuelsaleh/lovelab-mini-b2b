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

  test('invalid year falls back to default (2026)', () => {
    expect(buildPricesBlock('2024')).toBe(buildPricesBlock('2026'));
    expect(buildPricesBlock(undefined)).toBe(buildPricesBlock('2026'));
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
