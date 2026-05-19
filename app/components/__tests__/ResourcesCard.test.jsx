/**
 * ResourcesCard tests — focused on the EAN Codes folder addition.
 *
 * Guarantees:
 *   - The Documents pane (with download folders) only renders for admins.
 *   - The new "EAN Codes" folder is listed for admins.
 *   - The folder, when expanded, exposes a download link to the GS1 file.
 *   - Selecting the EAN file flips on the email button.
 */

import { render, screen, fireEvent } from '@testing-library/react'

jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key) => {
      const map = {
        'resources.documents': 'Documents',
        'resources.catalogue': 'Catalogue',
        'resources.packs': 'Packs',
        'resources.priceList': 'Price List',
        'resources.eanCodes': 'EAN Codes',
        'resources.sendByEmail': 'Send 1 file by email',
        'resources.sendByEmailPlural': 'Send 2 files by email',
      }
      return map[key] || key
    },
  }),
}))

// SendResourcesModal pulls in browser-only stuff we don't need to exercise here.
jest.mock('../SendResourcesModal', () => ({
  __esModule: true,
  default: () => null,
}))

import ResourcesCard from '../ResourcesCard'

describe('ResourcesCard — EAN Codes folder', () => {
  it('does not render the document folders for non-admins', () => {
    render(<ResourcesCard isAdmin={false} />)
    expect(screen.queryByText('EAN Codes')).not.toBeInTheDocument()
    expect(screen.queryByText('Catalogue')).not.toBeInTheDocument()
  })

  it('renders the EAN Codes folder for admins', () => {
    render(<ResourcesCard isAdmin={true} />)
    expect(screen.getByText('EAN Codes')).toBeInTheDocument()
  })

  it('exposes the GS1 file with a correct download link when expanded', () => {
    render(<ResourcesCard isAdmin={true} />)
    fireEvent.click(screen.getByText('EAN Codes'))
    const link = screen.getByText('Final-GS1-Code.xlsx').closest('a')
    expect(link).not.toBeNull()
    // Next.js will URL-encode the space at runtime; the href attribute we wrote
    // is the raw path so the link points at /Ean Codes/Final-GS1-Code.xlsx.
    expect(link.getAttribute('href')).toBe('/Ean Codes/Final-GS1-Code.xlsx')
    expect(link.getAttribute('download')).toBe('Final-GS1-Code.xlsx')
  })

  it('toggles the email button on when the EAN file is selected', () => {
    render(<ResourcesCard isAdmin={true} />)
    fireEvent.click(screen.getByText('EAN Codes'))
    // No "Send … by email" button before any selection.
    expect(screen.queryByText(/Send .* by email/i)).not.toBeInTheDocument()

    const checkbox = screen.getByLabelText('Select Final-GS1-Code.xlsx')
    fireEvent.click(checkbox)

    expect(screen.getByText(/Send 1 file by email/i)).toBeInTheDocument()
  })
})
