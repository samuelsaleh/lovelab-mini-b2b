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
