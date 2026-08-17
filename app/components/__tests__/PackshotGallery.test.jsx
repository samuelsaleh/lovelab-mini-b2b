import { fireEvent, render, screen } from '@testing-library/react'

jest.mock('@/lib/packshot-lookup', () => ({
  getAllCollectionIds: () => ['CUTY', 'CUTY_NECK'],
  getCollectionLabel: (id) => ({
    CUTY: 'CUTY',
    CUTY_NECK: 'CUTY NECKLACE',
  }[id] || id),
  getCollectionImages: (id) => (
    id === 'CUTY_NECK'
      ? [{ url: '/Packshot%20Folder/Necklaces/necks%20cuty/necklace.png', color: 'Necklace Black' }]
      : [{ url: '/Packshot%20Folder/Bracelets/Cuty/bracelet.png', color: 'Bracelet Black' }]
  ),
  getCollectionFilters: () => ({ housings: [], shapes: [], subgroups: [] }),
}))

jest.mock('@/lib/catalog', () => ({
  canSeeCollection: () => true,
}))

jest.mock('../PackshotLightbox', () => ({
  __esModule: true,
  default: () => null,
}))

const mockResponsive = { isMobile: false, isTablet: false, isDesktop: true, isCompact: false }
jest.mock('@/lib/useIsMobile', () => ({
  useResponsive: () => mockResponsive,
}))

import PackshotGallery from '../PackshotGallery'

describe('PackshotGallery product type selector', () => {
  it('switches from bracelet images to dedicated necklace images', () => {
    render(<PackshotGallery inline isAdmin />)

    expect(screen.getByText('Bracelet Black')).toBeInTheDocument()
    expect(screen.queryByText('Necklace Black')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Necklace' }))

    expect(screen.getByRole('button', { name: 'CUTY NECKLACE' })).toBeInTheDocument()
    expect(screen.getByText('Necklace Black')).toBeInTheDocument()
    expect(screen.queryByText('Bracelet Black')).not.toBeInTheDocument()
  })
})

/**
 * Mobile layout regression (Aug 2026): on phones the wrapping collection/filter
 * pill rows filled almost the whole screen and were not scrollable, so users
 * "couldn't swipe" — the photo grid was reduced to an invisible sliver
 * (40px tall on an iPhone SE). On mobile the pill rows must be single
 * horizontally-scrollable rows and the grid must use 2 columns.
 */
describe('PackshotGallery mobile layout', () => {
  afterEach(() => { mockResponsive.isMobile = false })

  function tabsRowOf(container) {
    return container.querySelector('.topnav-tabbar')
  }

  it('mobile: collection tabs are a single horizontally scrollable row', () => {
    mockResponsive.isMobile = true
    const { container } = render(<PackshotGallery inline isAdmin />)
    const tabs = tabsRowOf(container)
    expect(tabs.style.flexWrap).toBe('nowrap')
    expect(tabs.style.overflowX).toBe('auto')
  })

  it('mobile: photo grid uses 2 columns', () => {
    mockResponsive.isMobile = true
    const { container } = render(<PackshotGallery inline isAdmin />)
    const grid = [...container.querySelectorAll('div')]
      .find(el => el.style.display === 'grid')
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, 1fr)')
  })

  it('desktop: tabs still wrap and grid keeps 4 columns', () => {
    const { container } = render(<PackshotGallery inline isAdmin />)
    const tabs = tabsRowOf(container)
    expect(tabs.style.flexWrap).toBe('wrap')
    const grid = [...container.querySelectorAll('div')]
      .find(el => el.style.display === 'grid')
    expect(grid.style.gridTemplateColumns).toBe('repeat(4, 1fr)')
  })
})
