import { render, screen, fireEvent } from '@testing-library/react'
import TranslateMenu from '../TranslateMenu'

const file = { name: 'Brand.pdf', path: '/BRAND/Brand.pdf' }
const open = () => fireEvent.click(screen.getByRole('button', { name: /translate to/i }))

describe('TranslateMenu', () => {
  it('opens a list of languages', () => {
    render(<TranslateMenu file={file} onTranslate={() => {}} />)
    open()
    expect(screen.getByRole('option', { name: /French/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /German/ })).toBeTruthy()
  })

  it('filters by first letters as you type', () => {
    render(<TranslateMenu file={file} onTranslate={() => {}} />)
    open()
    fireEvent.change(screen.getByLabelText('Search languages'), { target: { value: 'f' } })
    const names = screen.getAllByRole('option').map((o) => o.textContent)
    expect(names.some((n) => n.startsWith('French'))).toBe(true)
    expect(names.some((n) => n.startsWith('Finnish'))).toBe(true)
    expect(names.some((n) => n.startsWith('German'))).toBe(false)
  })

  it('picks a language with the mouse and reports file + language', () => {
    const onTranslate = jest.fn()
    render(<TranslateMenu file={file} onTranslate={onTranslate} />)
    open()
    fireEvent.mouseDown(screen.getByRole('option', { name: /Dutch/ }))
    expect(onTranslate).toHaveBeenCalledWith(file, expect.objectContaining({ code: 'nl' }))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('picks the first match with Enter', () => {
    const onTranslate = jest.fn()
    render(<TranslateMenu file={file} onTranslate={onTranslate} />)
    open()
    const input = screen.getByLabelText('Search languages')
    fireEvent.change(input, { target: { value: 'ita' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTranslate).toHaveBeenCalledWith(file, expect.objectContaining({ code: 'it' }))
  })

  it('moves with the arrow keys and closes on Escape', () => {
    const onTranslate = jest.fn()
    render(<TranslateMenu file={file} onTranslate={onTranslate} />)
    open()
    const input = screen.getByLabelText('Search languages')
    fireEvent.change(input, { target: { value: 'g' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTranslate.mock.calls[0][1].code).toBe('el')
    open()
    fireEvent.keyDown(screen.getByLabelText('Search languages'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows an empty state and is disabled while busy', () => {
    const { rerender } = render(<TranslateMenu file={file} onTranslate={() => {}} />)
    open()
    fireEvent.change(screen.getByLabelText('Search languages'), { target: { value: 'zzz' } })
    expect(screen.getByText('No language')).toBeTruthy()
    rerender(<TranslateMenu file={file} onTranslate={() => {}} busy />)
    expect(screen.getByRole('button', { name: /translating/i }).disabled).toBe(true)
  })
})
