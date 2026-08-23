const { parseAnalyticsMarkdown, splitInline } = require('../analyticsMarkdown')

describe('parseAnalyticsMarkdown', () => {
  it('splits a structured Claude answer into heading / numbers / list', () => {
    const blocks = parseAnalyticsMarkdown([
      '## Answer',
      'Germany leads with **€1,000**.',
      '',
      '## Numbers',
      '- Orders: 3',
      '- Revenue: €1,000',
      '',
      '## Breakdown',
      '1. Black — 2 pcs',
      '2. Red — 1 pc',
    ].join('\n'))

    expect(blocks.map((b) => b.type)).toEqual(['heading', 'p', 'heading', 'list', 'heading', 'list'])
    expect(blocks[3].list).toBe('ul')
    expect(blocks[5].list).toBe('ol')
    expect(blocks[5].items).toHaveLength(2)
    expect(splitInline('Germany leads with **€1,000**.')).toEqual([
      { type: 'text', text: 'Germany leads with ' },
      { type: 'bold', text: '€1,000' },
      { type: 'text', text: '.' },
    ])
  })
})
