import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockSend = jest.fn().mockResolvedValue({ message: 'Germany leads with €1,000.' })

jest.mock('@/lib/api', () => ({
  sendAnalyticsChat: (...args) => mockSend(...args),
}))

import AnalyticsChatPanel, { ANALYTICS_CHAT_CHIPS } from '../AnalyticsChatPanel'

describe('AnalyticsChatPanel', () => {
  it('offers the suggested analysis chips and sends the chip text', async () => {
    const docs = [{ id: 'd1' }]
    render(
      <AnalyticsChatPanel
        isOpen
        onClose={() => {}}
        analyticsContext="KPIs: stub"
        docs={docs}
      />,
    )

    expect(ANALYTICS_CHAT_CHIPS).toEqual([
      'Every nylon color including zeros',
      'All countries by revenue',
      'Silk vs nylon in Germany',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'All countries by revenue' }))

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1))
    expect(mockSend).toHaveBeenCalledWith(
      [{ role: 'user', content: 'All countries by revenue' }],
      'KPIs: stub',
      { docs },
    )
    expect(await screen.findByText('Germany leads with €1,000.')).toBeInTheDocument()
  })

  it('renders a structured Claude answer as headings and bullets', async () => {
    mockSend.mockResolvedValueOnce({
      message: [
        '## Answer',
        'Germany leads with **€1,000**.',
        '',
        '## Numbers',
        '- Orders: 4',
        '- Revenue: €1,000',
      ].join('\n'),
    })

    render(
      <AnalyticsChatPanel
        isOpen
        onClose={() => {}}
        analyticsContext="KPIs: stub"
        docs={[{ id: 'd1' }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'All countries by revenue' }))

    expect(await screen.findByTestId('analytics-structured-answer')).toBeInTheDocument()
    expect(screen.getByText('Answer')).toBeInTheDocument()
    expect(screen.getByText('Germany leads with')).toBeInTheDocument()
    expect(screen.getAllByText('€1,000').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Orders: 4')).toBeInTheDocument()
  })
})
