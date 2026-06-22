/**
 * OrderTypePicker — allowedTypes filtering
 */

import { render, screen, fireEvent } from '@testing-library/react'
import OrderTypePicker from '../OrderTypePicker'

describe('OrderTypePicker', () => {
  it('shows all order types by default', () => {
    render(<OrderTypePicker onSelect={jest.fn()} onClose={jest.fn()} />)
    expect(screen.getByText('B2B Order')).toBeInTheDocument()
    expect(screen.getByText('Sample Order')).toBeInTheDocument()
    expect(screen.getByText('Internal Order')).toBeInTheDocument()
  })

  it('filters to allowedTypes when provided', () => {
    render(
      <OrderTypePicker
        allowedTypes={['b2b', 'sample']}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    expect(screen.getByText('B2B Order')).toBeInTheDocument()
    expect(screen.getByText('Sample Order')).toBeInTheDocument()
    expect(screen.queryByText('Internal Order')).not.toBeInTheDocument()
  })

  it('calls onSelect with the chosen type', () => {
    const onSelect = jest.fn()
    render(
      <OrderTypePicker
        allowedTypes={['b2b', 'sample']}
        onSelect={onSelect}
        onClose={jest.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Sample Order'))
    expect(onSelect).toHaveBeenCalledWith('sample')
  })
})
