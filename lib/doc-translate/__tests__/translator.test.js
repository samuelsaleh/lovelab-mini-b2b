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

  it('turns thinking off so the token budget goes to the translation', async () => {
    // Sonnet 5 thinks by default; on a real 25-paragraph batch it used all 6000
    // tokens thinking and returned no text.
    const createMessage = jest.fn(async () => reply([['0:0', 'Qui sommes-nous'], ['0:1', 'Nous fabriquons des bijoux en **argent sterling 925**.'], ['0:2', 'LA MARQUE']]))
    await translateUnits({ items, language: fr }, { createMessage })
    expect(createMessage.mock.calls[0][0].thinking).toEqual({ type: 'disabled' })
  })

  it('rejects a translation with a stray character from another script and asks again', async () => {
    const one = [{ key: '0:0', text: 'How the company is built', chars: 24 }]
    const createMessage = jest.fn()
      .mockResolvedValueOnce(reply([['0:0', "Comment l'entreprise est构ite"]]))
      .mockResolvedValueOnce(reply([['0:0', "Comment l'entreprise est construite"]]))
    const { map, failed } = await translateUnits({ items: one, language: fr }, { createMessage })
    expect(map.get('0:0')).toBe("Comment l'entreprise est construite")
    expect(failed).toEqual([])
  })

  it('accepts Greek letters for Greek and Latin brand names inside it', async () => {
    const one = [{ key: '0:0', text: 'The LoveLab story', chars: 17 }]
    const createMessage = jest.fn(async () => reply([['0:0', 'Η ιστορία της LoveLab']]))
    const { map } = await translateUnits({ items: one, language: { code: 'el', name: 'Greek' } }, { createMessage })
    expect(map.get('0:0')).toBe('Η ιστορία της LoveLab')
  })

  it('keeps a translation whose line breaks differ from the source', async () => {
    const two = [{ key: '0:0', text: 'Line one\nLine two', chars: 17 }]
    const createMessage = jest.fn(async () => reply([['0:0', 'Ligne un ligne deux']]))
    const { map, failed } = await translateUnits({ items: two, language: fr }, { createMessage })
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(map.get('0:0')).toBe('Ligne un ligne deux')
    expect(failed).toEqual([])
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

describe('translateUnits — completeness', () => {
  const sentTo = (createMessage, n) => JSON.parse(createMessage.mock.calls[n][0].messages[0].content.split('\n\n')[1]).items

  it('gives the first pass room (30%) for languages that run longer, not for letter-spaced labels', async () => {
    const createMessage = jest.fn(async () => reply([]))
    await translateUnits({ items, language: fr }, { createMessage })
    expect(sentTo(createMessage, 0).map((i) => i.max_chars)).toEqual([13, 50, 9])
  })

  it('does not accept the source text echoed back as a translation', async () => {
    const long = { key: '1:0', text: 'Every piece begins with a spark.', chars: 32 }
    const createMessage = jest.fn(async () => reply([['1:0', 'Every piece begins with a spark.']]))
    const { map, failed } = await translateUnits({ items: [long], language: fr }, { createMessage })
    expect(map.size).toBe(0)
    expect(failed).toEqual(['1:0'])
  })

  it('does not accept an English title echoed back, even a short one', async () => {
    const t = [{ key: '0:0', text: 'The Collections', chars: 15 }, { key: '0:1', text: 'Your combination', chars: 16 }, { key: '0:2', text: 'NEW', chars: 3 }, { key: '0:3', text: 'ANTWERP · BELGIUM', chars: 17 }]
    const createMessage = jest.fn(async () => reply(t.map((i) => [i.key, i.text])))
    const { map, failed } = await translateUnits({ items: t, language: fr }, { createMessage })
    expect(map.size).toBe(0)
    expect(failed).toEqual(['0:0', '0:1', '0:2', '0:3'])
  })

  it('accepts a contact line or a name that is the same in every language', async () => {
    const same = [
      { key: '0:0', text: '**LoveLab Antwerp** · The Love Group BV +32 494 039 945\nalberto@love-lab.com\nwww.lovelab.be', chars: 80 },
      { key: '0:1', text: 'LOVELAB ANTWERP · THE LOVE GROUP BV', chars: 35 },
      { key: '0:2', text: 'shapy shine x cubix x cuty', chars: 26 },
    ]
    const createMessage = jest.fn(async () => reply(same.map((i) => [i.key, i.text])))
    const { map, failed } = await translateUnits({ items: same, language: fr }, { createMessage })
    expect(failed).toEqual([])
    expect(map.size).toBe(3)
  })

  it('asks for each missing paragraph on its own', async () => {
    const two = [
      { key: '0:0', text: 'We make **silver** jewellery.', chars: 28 },
      { key: '0:1', text: 'Second', chars: 6 },
    ]
    const createMessage = jest.fn()
      .mockResolvedValueOnce(reply([['0:1', 'Deuxième']])) // 0:0 missing
      .mockResolvedValueOnce(reply([])) // retry: still missing
      .mockResolvedValueOnce(reply([['0:0', 'Nous fabriquons des bijoux **en argent**.']])) // single
    const { map, failed } = await translateUnits({ items: two, language: fr }, { createMessage })
    expect(createMessage).toHaveBeenCalledTimes(3)
    expect(sentTo(createMessage, 2)).toHaveLength(1)
    expect(map.get('0:0')).toContain('**')
    expect(failed).toEqual([])
  })

  it('drops unbalanced bold markers rather than leave the paragraph untranslated', async () => {
    const one = [{ key: '0:0', text: 'We make **sterling silver** jewellery.', chars: 38 }]
    const createMessage = jest.fn(async () => reply([['0:0', 'Nous fabriquons des **bijoux en argent.']]))
    const { map, failed } = await translateUnits({ items: one, language: fr }, { createMessage })
    expect(map.get('0:0')).toBe('Nous fabriquons des bijoux en argent.')
    expect(failed).toEqual([])
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
