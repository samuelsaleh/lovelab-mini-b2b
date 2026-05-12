/**
 * @jest-environment node
 *
 * sendBuilderChat builds the system prompt that tells the in-builder AI
 * Advisor what fields to ask for and what's currently in the order. We
 * intercept the underlying fetch so we can read the prompt without making
 * a real API call.
 *
 * What we pin:
 *   - The prompt embeds the active pricelist year (so 2025 quotes don't
 *     suddenly use 2026 numbers when the agent toggles back).
 *   - It lists closure (braided / nonBraided) as a required CUTY/CUBIX
 *     field — without this the model will silently skip closure and the
 *     resulting row fails validation in OrderForm.
 *   - It tells the model to double-check before proposing actions and
 *     forbids inventing prices.
 *   - The ADD action JSON example includes both certType and closureType.
 */

import { sendBuilderChat } from '../api.js'

describe('sendBuilderChat — system prompt contract', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ text: JSON.stringify({ message: 'ok', actions: [] }) }],
      }),
    }))
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  async function captureSystem({ pricelistYear }) {
    await sendBuilderChat([{ role: 'user', content: 'hi' }], 'no order yet', { pricelistYear })
    expect(global.fetch).toHaveBeenCalled()
    const callArgs = global.fetch.mock.calls[0]
    const body = JSON.parse(callArgs[1].body)
    return body.system
  }

  test('embeds the requested pricelist year in the prompt', async () => {
    const sys25 = await captureSystem({ pricelistYear: '2025' })
    expect(sys25).toMatch(/ACTIVE PRICE LIST: 2025/)
  })

  test('uses 2026 prices when 2026 is requested (CUTY 0.05 In-house @ €24)', async () => {
    const sys26 = await captureSystem({ pricelistYear: '2026' })
    expect(sys26).toMatch(/ACTIVE PRICE LIST: 2026/)
    expect(sys26).toContain('0.05=€24')
  })

  test('uses 2025 prices when 2025 is requested (CUTY 0.05 In-house @ €20)', async () => {
    const sys25 = await captureSystem({ pricelistYear: '2025' })
    expect(sys25).toContain('0.05=€20')
  })

  test('declares closureType as a required CUTY/CUBIX field', async () => {
    const sys = await captureSystem({ pricelistYear: '2026' })
    expect(sys).toMatch(/closureType.*braided.*nonBraided/i)
    expect(sys).toMatch(/CUTY and CUBIX/i)
  })

  test('ADD action example carries certType and closureType', async () => {
    const sys = await captureSystem({ pricelistYear: '2026' })
    expect(sys).toMatch(/"certType":"igi"/)
    expect(sys).toMatch(/"closureType":"braided"/)
  })

  test('tells the model to double-check before proposing actions', async () => {
    const sys = await captureSystem({ pricelistYear: '2026' })
    expect(sys).toMatch(/DOUBLE-CHECK BEFORE/i)
  })

  test('forbids inventing prices', async () => {
    const sys = await captureSystem({ pricelistYear: '2026' })
    expect(sys).toMatch(/NEVER invent prices/i)
  })

  test('reminds model In-house cert is unavailable at 0.20 / 0.30', async () => {
    const sys = await captureSystem({ pricelistYear: '2026' })
    expect(sys).toMatch(/In-house.*0\.05.*0\.10/i)
  })
})
