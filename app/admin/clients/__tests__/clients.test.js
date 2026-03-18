/**
 * Tests for clients page helpers: normaliseCountry, csvEscape
 * and a component integration test for the filter + CSV export workflow.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { normaliseCountry, csvEscape } from '../page'

// ---------------------------------------------------------------------------
// Unit tests — normaliseCountry
// ---------------------------------------------------------------------------

describe('normaliseCountry', () => {
  test('returns empty string for null', () => {
    expect(normaliseCountry(null)).toBe('')
  })

  test('returns empty string for undefined', () => {
    expect(normaliseCountry(undefined)).toBe('')
  })

  test('returns empty string for whitespace-only string', () => {
    expect(normaliseCountry('   ')).toBe('')
  })

  test('returns empty string for empty string', () => {
    expect(normaliseCountry('')).toBe('')
  })

  test('normalises ALLCAPS to Title Case', () => {
    expect(normaliseCountry('FRANCE')).toBe('France')
  })

  test('normalises lowercase to Title Case', () => {
    expect(normaliseCountry('france')).toBe('France')
  })

  test('preserves already Title Case', () => {
    expect(normaliseCountry('France')).toBe('France')
  })

  test('trims surrounding whitespace before normalising', () => {
    expect(normaliseCountry('  FRANCE  ')).toBe('France')
  })

  // Alias map tests
  test('maps DUITSLAND → Germany', () => {
    expect(normaliseCountry('DUITSLAND')).toBe('Germany')
  })

  test('maps duitsland (lowercase) → Germany', () => {
    expect(normaliseCountry('duitsland')).toBe('Germany')
  })

  test('maps SUISSE → Switzerland', () => {
    expect(normaliseCountry('SUISSE')).toBe('Switzerland')
  })

  test('maps ZWITSERLAND → Switzerland', () => {
    expect(normaliseCountry('ZWITSERLAND')).toBe('Switzerland')
  })

  test('maps ITALIA → Italy', () => {
    expect(normaliseCountry('ITALIA')).toBe('Italy')
  })

  test('maps CORSE → France', () => {
    expect(normaliseCountry('CORSE')).toBe('France')
  })

  test('maps haute-corse (france) → France', () => {
    expect(normaliseCountry('haute-corse (france)')).toBe('France')
  })

  test('maps HOLLAND → Netherlands', () => {
    expect(normaliseCountry('HOLLAND')).toBe('Netherlands')
  })

  test('maps UEA → UAE', () => {
    expect(normaliseCountry('UEA')).toBe('UAE')
  })

  test('maps USA → United States', () => {
    expect(normaliseCountry('USA')).toBe('United States')
  })

  test('maps UK → United Kingdom', () => {
    expect(normaliseCountry('UK')).toBe('United Kingdom')
  })

  test('passes through unknown country as Title Case', () => {
    expect(normaliseCountry('UNKNOWNLAND')).toBe('Unknownland')
  })
})

// ---------------------------------------------------------------------------
// Unit tests — csvEscape
// ---------------------------------------------------------------------------

describe('csvEscape', () => {
  test('returns plain string unchanged', () => {
    expect(csvEscape('Hello')).toBe('Hello')
  })

  test('wraps string containing comma in double quotes', () => {
    expect(csvEscape('Smith, Jones')).toBe('"Smith, Jones"')
  })

  test('wraps string containing double quote and escapes it', () => {
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""')
  })

  test('wraps string containing newline', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
  })

  test('wraps string containing carriage return', () => {
    expect(csvEscape('line1\rline2')).toBe('"line1\rline2"')
  })

  test('handles null → empty string', () => {
    expect(csvEscape(null)).toBe('')
  })

  test('handles undefined → empty string', () => {
    expect(csvEscape(undefined)).toBe('')
  })

  test('converts numbers to string', () => {
    expect(csvEscape(42)).toBe('42')
  })

  test('converts zero to string', () => {
    expect(csvEscape(0)).toBe('0')
  })
})

// ---------------------------------------------------------------------------
// Component integration test — filter by country + CSV export
// ---------------------------------------------------------------------------

// Mock the API calls made by the page
beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (url.includes('/api/clients')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          clients: [
            { id: '1', company: 'BOUTIQUE JULIA',  country: 'france',  email: 'julia@test.com',  name: 'Julia',  source: 'salesforce' },
            { id: '2', company: 'SARL Casadona',   country: 'FRANCE',  email: 'casa@test.com',   name: 'Casa',   source: 'salesforce' },
            { id: '3', company: 'KNIEWASSER',       country: 'Austria', email: 'knie@test.com',   name: 'Knie',   source: 'manual' },
            { id: '4', company: 'Smith, Jones & Co', country: 'Germany', email: 'smith@test.com', name: 'Smith',  source: 'manual' },
          ],
        }),
      })
    }
    if (url.includes('/api/documents')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ documents: [] }),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })

  // Mock URL.createObjectURL and revokeObjectURL
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-url')
  global.URL.revokeObjectURL = jest.fn()
})

afterEach(() => {
  jest.restoreAllMocks()
})

// Lazy import the page component after mocks are set up
let AdminClientsPage
beforeAll(async () => {
  const mod = await import('../page')
  AdminClientsPage = mod.default
})

describe('AdminClientsPage', () => {
  test('renders without crashing', async () => {
    render(<AdminClientsPage />)
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
    expect(screen.getByText(/Client Directory/)).toBeInTheDocument()
  })

  test('deduplicates France in country dropdown (france + FRANCE → France once)', async () => {
    render(<AdminClientsPage />)
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())

    // The dropdown should have exactly one "France" option
    const select = screen.getByRole('combobox')
    const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent)
    const franceOptions = options.filter(o => o === 'France')
    expect(franceOptions).toHaveLength(1)
  })

  test('filtering by France shows only French clients', async () => {
    const user = userEvent.setup()
    render(<AdminClientsPage />)
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())

    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'France')

    await waitFor(() => {
      expect(screen.getByText('BOUTIQUE JULIA')).toBeInTheDocument()
      expect(screen.getByText('SARL Casadona')).toBeInTheDocument()
      expect(screen.queryByText('KNIEWASSER')).not.toBeInTheDocument()
    })
  })

  test('Export CSV button is rendered', async () => {
    render(<AdminClientsPage />)
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
    expect(screen.getByText(/Export CSV/i)).toBeInTheDocument()
  })

  test('clicking Export CSV triggers a download', async () => {
    const user = userEvent.setup()
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<AdminClientsPage />)
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())

    await user.click(screen.getByText(/Export CSV/i))

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  test('CSV export filename includes country name when filter is active', async () => {
    const user = userEvent.setup()
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const hrefSpy = jest.spyOn(HTMLAnchorElement.prototype, 'download', 'set')

    render(<AdminClientsPage />)
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())

    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'France')
    await user.click(screen.getByText(/Export CSV/i))

    // The download attribute should include 'france'
    expect(hrefSpy.mock.calls.some(([val]) => val.toLowerCase().includes('france'))).toBe(true)
  })

  test('CSV output properly escapes company name with comma', async () => {
    const user = userEvent.setup()
    let capturedCsvContent = ''
    const origBlob = global.Blob
    global.Blob = class extends origBlob {
      constructor(parts, opts) {
        super(parts, opts)
        capturedCsvContent = parts.join('')
      }
    }

    render(<AdminClientsPage />)
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
    await user.click(screen.getByText(/Export CSV/i))

    // "Smith, Jones & Co" contains a comma so must be quoted in the CSV
    expect(capturedCsvContent).toContain('"Smith, Jones & Co"')

    global.Blob = origBlob
  })
})
