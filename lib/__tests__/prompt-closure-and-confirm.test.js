/**
 * @jest-environment node
 *
 * The AI advisor MUST treat the new closure (Braided / Non-braided) field
 * the same way it treats certificate, housing, size, etc. — never guess,
 * always ask, and double-check before quoting.
 *
 * Without these prompt rules in place the AI happily skipped the closure
 * field, the agent applied the action, and the row failed validation in
 * OrderForm because closureType was empty for CUTY/CUBIX. This file pins
 * those rules so a future prompt rewrite cannot silently drop them.
 */

import { buildSystemPrompt } from '../prompt.js'

describe('AI advisor prompt — closure + double-check rules', () => {
  const prompt = buildSystemPrompt('2026')

  test('lists closure as a required field for CUTY/CUBIX', () => {
    expect(prompt).toMatch(/Closure.*CUTY.*CUBIX/i)
    expect(prompt).toMatch(/Braided/i)
    expect(prompt).toMatch(/Non-braided/i)
  })

  test('declares closureType in the ALWAYS-INCLUDE field list', () => {
    expect(prompt).toMatch(/closureType.*braided.*nonBraided/i)
  })

  test('explicitly tells the model to double-check every line before quoting', () => {
    expect(prompt).toMatch(/DOUBLE-CHECK/i)
  })

  test('forbids inventing prices', () => {
    expect(prompt).toMatch(/NEVER invent prices/i)
  })

  test('reminds model that In-house cert is not available at 0.20+ carats', () => {
    // CUTY/CUBIX at 0.20+ are IGI-only — the prompt has tripped this up
    // before, so we pin the wording.
    expect(prompt).toMatch(/In-house.*0\.20|0\.20.*In-house/i)
  })

  test('JSON example schema includes closureType', () => {
    expect(prompt).toMatch(/"closureType":"braided"/)
  })
})
