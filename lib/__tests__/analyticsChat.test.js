/**
 * Client-side analytics chat loop: one tool_use, run locally, then final text.
 */

const {
  applyToolResults,
  completeAnalyticsChat,
  extractAssistantText,
  toApiMessages,
} = require('../analyticsChat')
const { runAnalyticsTool } = require('../analyticsBreakdowns')

const CUTY = { collection: 'CUTY', colorCord: 'Black', quantity: '2', total: '68' }
const SILK = { collection: 'SHAPY SPARKLE FANCY', colorCord: 'Baby pink', quantity: '1', total: '200', material: 'Silk (Thin)' }

function doc(id, country, rows, total = 100) {
  return {
    id,
    status: 'sent',
    order_channel: 'b2b',
    document_type: 'order',
    total_amount: total,
    metadata: { formState: { country, rows } },
  }
}

const DOCS = [
  doc('de', 'Germany', [CUTY, SILK], 268),
  doc('fr', 'France', [SILK], 200),
]

describe('applyToolResults / slice runner', () => {
  it('slice({ country: Germany, material: silk }) only counts matching lines', () => {
    const results = applyToolResults(
      [{ type: 'tool_use', id: 'tu1', name: 'slice', input: { country: 'Germany', material: 'silk' } }],
      DOCS,
    )
    expect(results).toHaveLength(1)
    expect(results[0].tool_use_id).toBe('tu1')
    const payload = JSON.parse(results[0].content)
    expect(payload.orders).toBe(1)
    expect(payload.pieces).toBe(1)
    expect(payload.revenue).toBe(200)
  })

  it('runAnalyticsTool slice matches applyToolResults', () => {
    const direct = runAnalyticsTool('slice', { country: 'Germany', material: 'silk' }, DOCS)
    expect(direct.pieces).toBe(1)
    expect(direct.revenue).toBe(200)
  })
})

describe('completeAnalyticsChat', () => {
  it('runs one tool_use then returns the final message', async () => {
    const postRound = jest.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tu1', name: 'countries', input: {} },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Germany leads with €268.' }],
      })

    const result = await completeAnalyticsChat({
      messages: [{ role: 'user', content: 'All countries by revenue' }],
      analyticsContext: 'KPIs: stub',
      docs: DOCS,
      postRound,
    })

    expect(result.message).toBe('Germany leads with €268.')
    expect(postRound).toHaveBeenCalledTimes(2)

    const secondCall = postRound.mock.calls[1][0]
    expect(secondCall.messages).toHaveLength(3)
    expect(secondCall.messages[1].role).toBe('assistant')
    expect(secondCall.messages[2].role).toBe('user')
    expect(secondCall.messages[2].content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tu1',
    })
    const countries = JSON.parse(secondCall.messages[2].content[0].content)
    expect(countries.map((c) => c.name).sort()).toEqual(['France', 'Germany'])
  })
})

describe('helpers', () => {
  it('extracts text blocks and keeps user/assistant turns', () => {
    expect(extractAssistantText([{ type: 'text', text: 'Hi' }, { type: 'tool_use', id: 'x' }])).toBe('Hi')
    expect(toApiMessages([
      { role: 'user', content: 'q' },
      { role: 'system', content: 'nope' },
      { role: 'assistant', content: 'a' },
    ])).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ])
  })
})
