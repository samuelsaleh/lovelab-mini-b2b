/**
 * KpiCard unit tests
 */
import { render, screen, fireEvent } from '@testing-library/react'
import KpiCard from '../KpiCard'

describe('KpiCard', () => {
  it('renders label and value', () => {
    render(<KpiCard label="B2B Orders" value={42} />)
    expect(screen.getByText('B2B Orders')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders sub text when provided', () => {
    render(<KpiCard label="Revenue" value="€1,234" sub="this month" />)
    expect(screen.getByText('this month')).toBeInTheDocument()
  })

  it('does not render sub text when omitted', () => {
    render(<KpiCard label="Revenue" value="€1,234" />)
    expect(screen.queryByText('this month')).not.toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = jest.fn()
    render(<KpiCard label="Agents" value={5} onClick={onClick} />)
    fireEvent.click(screen.getByTestId('kpi-card'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has pointer cursor when onClick provided', () => {
    render(<KpiCard label="Agents" value={5} onClick={jest.fn()} />)
    expect(screen.getByTestId('kpi-card')).toHaveStyle({ cursor: 'pointer' })
  })

  it('has default cursor when onClick not provided', () => {
    render(<KpiCard label="Agents" value={5} />)
    expect(screen.getByTestId('kpi-card')).toHaveStyle({ cursor: 'default' })
  })
})
