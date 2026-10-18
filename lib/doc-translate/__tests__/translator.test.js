/**
 * @jest-environment node
 */
import { translateUnits, shortenUnits } from '../translator'

const fr = { code: 'fr', name: 'French' }
const items = [
  { key: '0:0', text: 'Who We Are', chars: 10 },
  { key: '0:1', text: 'We make **sterling silver 925** jewellery.', chars: 38 },
  { key: '0:2', text: 'THE BRAND', chars: 9, letterSpaced: true },
]
const reply = (arr) => ({ text: JSON.stringify({ items: arr.map(([k, t]) => ({ k, t })) }) })

describe('translateUnits', () => {
  it('returns a translation per key', async () => {
    const createMessage = jest.fn(async () => reply([['0:0', 'Qui sommes-nous'], ['0:1', 'Nous fabriquons des bijoux en **argent sterling 925**.'], ['0:2', 'LA MARQUE']]))
    const { map, failed } = await translateUnits({ items, language: fr }, { createMessage })
    expect(failed).toEqual([])
    expect(map.get('0:1')).toContain('**argent sterling 925**')
    const prompt = createMessage.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('French (fr)')
    expect(JSON.parse(prompt.split('\n\n')[1]).items[2]).toMatchObject({ k: '0:2', letter_spaced: true, max_chars: 9 })
  })

  it('rejects an item whose bold markers were lost and retries it once', async () => {
    const createMessage = jest.fn()
      .mockResolvedValueOnce(reply([['0:0', 'Qui sommes-nous'], ['0:1', 'Nous fabriquons des bijoux en argent sterling 925.'], ['0:2', 'LA MARQUE']]))
      .mockResolvedValueOnce(reply([['0:1', 'Nous fabriquons des bijoux en **argent sterling 925**.']]))
    const { map, failed } = await translateUnits({ items, language: fr }, { createMessage })
    expect(createMessage).toHaveBeenCalledTimes(2)
    expect(map.get('0:1')).toContain('**')
    expect(failed).toEqual([])
  })

  it('reports keys that never come back valid', async () => {
    const createMessage = jest.fn(async () => reply([['0:0', 'Qui sommes-nous']]))
    const { map, failed } = await translateUnits({ items, language: fr }, { createMessage })
    expect(map.has('0:0')).toBe(true)
    expect(failed).toEqual(['0:1', '0:2'])
  })

  it('survives an API failure and reports everything as failed', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const createMessage = jest.fn(async () => { throw new Error('boom') })
    const { map, failed } = await translateUnits({ items, language: fr }, { createMessage })
    expect(map.size).toBe(0)
    expect(failed).toHaveLength(3)
  })

  it('splits large documents into batches', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ key: `0:${i}`, text: `Text ${i}`, chars: 7 }))
    const createMessage = jest.fn(async ({ messages }) => {
      const sent = JSON.parse(messages[0].content.split('\n\n')[1]).items
      return reply(sent.map((s) => [s.k, `T ${s.k}`]))
    })
    const { map } = await translateUnits({ items: many, language: fr }, { createMessage })
    expect(createMessage).toHaveBeenCalledTimes(3)
    expect(map.size).toBe(60)
  })
})

describe('shortenUnits', () => {
  it('keeps only answers that are really shorter', async () => {
    const createMessage = jest.fn(async () => reply([['a', 'Court'], ['b', 'Encore plus long que avant']]))
    const got = await shortenUnits({
      items: [{ key: 'a', text: 'x', chars: 10, current: 'Beaucoup trop long' }, { key: 'b', text: 'y', chars: 10, current: 'Trop long' }],
      language: fr,
    }, { createMessage })
    expect([...got.keys()]).toEqual(['a'])
  })
})
