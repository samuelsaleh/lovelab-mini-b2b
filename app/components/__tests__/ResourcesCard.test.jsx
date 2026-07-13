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

const FRENCH_LINKS = {
  generalSept: 'https://www.canva.com/design/DAHPPy7GKXc/fzRUgvGrbqq5jf1DJ_DcTQ/view?embed',
  bijorkaSept: 'https://www.canva.com/design/DAHPPw_T2xI/Z_Tyy6Lp6OWkBRy1x5dCOg/view?embed',
  premiereFrance: 'https://www.canva.com/design/DAG8QTSZGDA/00BwwxPy9ZTg_g18XWm9EQ/view?embed',
  premiereGeneral: 'https://www.canva.com/design/DAHPP8Z87Jw/ke6GNZN7sohPEteltgMNQw/view?embed',
}

const FRENCH_PDFS = {
  generalSept: '/catalogues/Francais/Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf',
  bijorkaSept: '/catalogues/Francais/Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf',
  premiereFrance: '/catalogues/Francais/_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
  premiereGeneral: '/catalogues/Francais/Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
}

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

describe('ResourcesCard — French catalogue preview and downloads', () => {
  it('does not show French catalogue preview choices to regular non-Nicolas agents', () => {
    render(<ResourcesCard isAdmin={false} userEmail="agent@example.com" />)

    expect(screen.queryByText('French catalogues')).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Catalogue français 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Catalogue France-Français Bijorka 1' })).not.toBeInTheDocument()
  })

  it('shows Nicolas the two September French catalogue preview choices only', () => {
    render(<ResourcesCard isAdmin={false} userEmail="nicolas.vial@ascension-france.com" />)

    expect(screen.getByRole('option', { name: 'Catalogue français 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Catalogue France-Français Bijorka 1' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Première classe catalogue France-Français 2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'La première classe catalogue France-Français general 2' })).not.toBeInTheDocument()
    expect(screen.queryByText('French catalogues')).not.toBeInTheDocument()
  })

  it('shows admins all four French catalogue preview choices, not quick links', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)

    expect(screen.getByRole('option', { name: 'Catalogue français 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Catalogue France-Français Bijorka 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Première classe catalogue France-Français 2' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'La première classe catalogue France-Français general 2' })).toBeInTheDocument()
    expect(screen.queryByText('French catalogues')).not.toBeInTheDocument()
  })

  it('switches the embedded demo and matching PDF when an admin selects a catalogue', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)

    const selector = screen.getByLabelText('Catalogue preview')
    fireEvent.change(selector, { target: { value: 'fr-premiere-general-oct' } })

    const preview = screen.getByTitle('Catalogue preview: La première classe catalogue France-Français general 2')
    expect(preview.getAttribute('src')).toBe(FRENCH_LINKS.premiereGeneral)
    expect(screen.getByRole('link', { name: 'Download PDF' }).getAttribute('href'))
      .toBe(FRENCH_PDFS.premiereGeneral)
  })

  it('lists every new French PDF in the admin document catalogue folder', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)
    fireEvent.click(screen.getByText('Catalogue'))

    expect(screen.getByText('Catalogue français 1.pdf').closest('a').getAttribute('href')).toBe(FRENCH_PDFS.generalSept)
    expect(screen.getByText('Catalogue France-Français Bijorka 1.pdf').closest('a').getAttribute('href')).toBe(FRENCH_PDFS.bijorkaSept)
    expect(screen.getByText('Première classe catalogue France-Français 2.pdf').closest('a').getAttribute('href')).toBe(FRENCH_PDFS.premiereFrance)
    expect(screen.getByText('La première classe catalogue France-Français general 2.pdf').closest('a').getAttribute('href')).toBe(FRENCH_PDFS.premiereGeneral)
  })
})
