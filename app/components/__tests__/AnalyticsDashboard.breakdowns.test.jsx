/**
 * AnalyticsDashboard — full Nylon/Silk color palettes and every country.
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { CORD_COLORS } from '@/lib/catalog'

jest.mock('recharts', () => ({
  ComposedChart: ({ children }) => <div data-testid="composed-chart">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Bar: () => null,
  Area: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))

jest.mock('../AnalyticsChatPanel', () => ({
  __esModule: true,
  default: () => null,
}))

import AnalyticsDashboard from '../AnalyticsDashboard'

const COUNTRIES = [
  'Germany', 'France', 'Italy', 'Spain', 'Austria',
  'Netherlands', 'Belgium', 'Switzerland', 'Portugal',
]

// 12 collections — enough to prove the old maxRows=10 table cut is gone.
// Qty steps keep CUTY first and Sienna Five last (the #12 that used to vanish).
const PRODUCT_LINES = [
  { collection: 'CUTY', quantity: '100', total: '3400' },
  { collection: 'CUBIX', quantity: '90', total: '2700' },
  { collection: 'SHAPY SHINE FANCY', quantity: '80', total: '4400' },
  { collection: 'MULTI THREE', quantity: '70', total: '4550' },
  { collection: 'MULTI FOUR', quantity: '60', total: '5100' },
  { collection: 'CUTY NECKLACE', quantity: '50', total: '2500' },
  { collection: 'MATCHY FANCY', quantity: '40', total: '8000' },
  { collection: 'MULTI FIVE', quantity: '30', total: '2850' },
  { collection: 'Flower Heart', quantity: '20', total: '4000' },
  { collection: 'Flower Marquise', quantity: '15', total: '3000' },
  { collection: 'Za-Ha', quantity: '10', total: '2000' },
  { collection: 'Sienna Five', quantity: '5', total: '1000' },
]

function orderDoc({ id, country, company, total = 100, rows = [] }) {
  return {
    id,
    document_type: 'order',
    status: 'sent',
    order_channel: 'b2b',
    total_amount: total,
    created_at: '2026-05-04T09:00:00Z',
    client_company: company || `${country} Co`,
    client_name: 'Buyer',
    event_id: null,
    events: null,
    metadata: {
      formState: {
        country,
        rows,
      },
    },
  }
}

const DOCS = [
  ...COUNTRIES.map((country, i) => orderDoc({
    id: `c${i}`,
    country,
    company: `${country} House`,
    total: 1000 - i * 10,
    rows: i === 0
      ? [
          { collection: 'CUTY', colorCord: 'Black', quantity: '2', total: '68' },
          { collection: 'CUTY', colorCord: 'Red', quantity: '5', total: '400' },
          ...PRODUCT_LINES,
        ]
      : [],
  })),
  // Extra German companies so drill-down is more than 10
  ...Array.from({ length: 11 }, (_, i) => orderDoc({
    id: `de-extra-${i}`,
    country: 'Germany',
    company: `Berlin Shop ${i + 1}`,
    total: 20,
  })),
]

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (String(url).startsWith('/api/documents')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ documents: DOCS }) })
    }
    if (String(url).startsWith('/api/events')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
})

describe('AnalyticsDashboard — colors + countries', () => {
  it('renders every Nylon palette colour including zeros', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByText('Colors sold')).toBeInTheDocument(), { timeout: 8000 })

    const nylon = screen.getByTestId('color-palette-nylon')
    for (const color of CORD_COLORS.nylon) {
      expect(screen.getByTestId(`color-row-nylon-${color.n}`)).toBeInTheDocument()
      expect(nylon).toHaveTextContent(color.n)
    }
    expect(CORD_COLORS.nylon.length).toBeGreaterThan(8)
  }, 12000)

  it('reorders Colors sold by pieces, revenue, and colour name', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByText('Colors sold')).toBeInTheDocument(), { timeout: 8000 })

    const names = () => [...screen.getByTestId('color-palette-nylon').querySelectorAll('[data-testid^="color-row-nylon-"]')]
      .map((el) => el.getAttribute('data-testid').replace('color-row-nylon-', ''))

    expect(names()[0]).toBe('Red')

    fireEvent.click(screen.getByTestId('pill-name'))
    expect(names()[0]).toBe('Black')

    fireEvent.click(screen.getByTestId('pill-revenue'))
    expect(names()[0]).toBe('Red')

    fireEvent.click(screen.getByTestId('pill-qty'))
    expect(names()[0]).toBe('Red')
  }, 12000)

  it('renders every sold country, not a top-7 cut', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByTestId('countries-table')).toBeInTheDocument(), { timeout: 8000 })

    const rows = screen.getAllByTestId(/^country-row-/)
    expect(rows).toHaveLength(COUNTRIES.length)
    COUNTRIES.forEach((name) => {
      expect(screen.getByTestId(`country-row-${name}`)).toBeInTheDocument()
    })
  }, 12000)

  it('lists every company in the country drill-down, not 10', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByTestId('country-row-Germany')).toBeInTheDocument(), { timeout: 8000 })

    fireEvent.click(screen.getByTestId('country-row-Germany'))
    await waitFor(() => expect(screen.getByTestId('country-companies-table')).toBeInTheDocument())

    const companies = screen.getAllByTestId(/^company-row-/)
    // 1 "Germany House" + 11 Berlin shops
    expect(companies.length).toBe(12)
    expect(screen.getByTestId('company-row-Berlin Shop 11')).toBeInTheDocument()
  }, 12000)
})

describe('AnalyticsDashboard — top products', () => {
  it('lists every collection, with CUTY first and the #12 name still present', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByTestId('products-table')).toBeInTheDocument(), { timeout: 8000 })

    const rows = screen.getAllByTestId(/^product-row-/)
    expect(rows.length).toBeGreaterThanOrEqual(12)
    expect(rows[0]).toHaveAttribute('data-testid', 'product-row-CUTY')
    PRODUCT_LINES.forEach((line) => {
      expect(screen.getByTestId(`product-row-${line.collection}`)).toBeInTheDocument()
    })
    expect(screen.getByTestId('product-row-Sienna Five')).toBeInTheDocument()
    expect(screen.getByTestId('products-chart')).toBeInTheDocument()
  }, 12000)
})
