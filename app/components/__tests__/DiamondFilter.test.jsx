import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import DiamondFilter from '../DiamondFilter'

const OPTIONS = [{ value: '0.10', count: 6 }, { value: '0.20', count: 4 }]

describe('DiamondFilter', () => {
  test('a selected value the options no longer offer stays visible and can be unticked', () => {
    const onChange = jest.fn()
    render(<DiamondFilter name="carats" allLabel="All carats" options={OPTIONS} selected={['0.30']} onChange={onChange} format={(v) => `${v} ct`} />)
    fireEvent.click(screen.getByRole('button', { name: /^carats:/i }))
    const stale = screen.getByLabelText(/^0\.30 ct/)
    expect(stale).toBeChecked()
    fireEvent.click(stale)
    expect(onChange).toHaveBeenCalledWith([])
  })

  test('Select all picks every option; Clear empties; Escape closes', () => {
    const onChange = jest.fn()
    render(<DiamondFilter name="carats" allLabel="All carats" options={OPTIONS} selected={['0.10']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^carats:/i }))
    fireEvent.click(screen.getByText('Select all'))
    expect(onChange).toHaveBeenLastCalledWith(['0.10', '0.20'])
    fireEvent.click(screen.getByText('Clear'))
    expect(onChange).toHaveBeenLastCalledWith([])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Select all')).not.toBeInTheDocument()
  })
})
