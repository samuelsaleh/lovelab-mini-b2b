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
  generalSept: '/catalogues/Francais/Sept%20Fr%20LoveLab%20B2B%20Catalogue%20General%20(210%20x%20210%20mm).pdf',
  bijorkaSept: '/catalogues/Francais/Sept%20Fr%20LoveLab%20B2B%20Catalogue%20(210%20x%20210%20mm).pdf',
  premiereFrance: '/catalogues/Francais/_Oct%20FR_LoveLab_B2B_Catalogue%20(210%20x%20210%20mm).pdf',
  premiereGeneral: '/catalogues/Francais/Oct%20FR_LoveLab_B2B_Catalogue%20General%20(210%20x%20210%20mm).pdf',
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
    // Encoded spaces so the browser / email fetcher do not 404 on the path.
    expect(link.getAttribute('href')).toBe('/Ean%20Codes/Final-GS1-Code.xlsx')
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
    expect(screen.queryByRole('option', { name: 'Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf' })).not.toBeInTheDocument()
  })

  it('shows Nicolas the two September French catalogue preview choices only', () => {
    render(<ResourcesCard isAdmin={false} userEmail="nicolas.vial@ascension-france.com" />)

    expect(screen.getByRole('option', { name: 'Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf' })).not.toBeInTheDocument()
    expect(screen.queryByText('French catalogues')).not.toBeInTheDocument()
  })

  it('shows admins all four French catalogue preview choices, not quick links', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)

    expect(screen.getByRole('option', { name: 'Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf' })).toBeInTheDocument()
    expect(screen.queryByText('French catalogues')).not.toBeInTheDocument()
  })

  it('switches the embedded demo and matching PDF when an admin selects a catalogue', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)

    const selector = screen.getByLabelText('Catalogue preview')
    fireEvent.change(selector, { target: { value: 'fr-premiere-general-oct' } })

    const preview = screen.getByTitle('Catalogue preview: Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf')
    expect(preview.getAttribute('src')).toBe(FRENCH_LINKS.premiereGeneral)
    expect(screen.getByRole('link', { name: 'Download PDF' }).getAttribute('href'))
      .toBe(FRENCH_PDFS.premiereGeneral)
  })

  it('shows the second English catalogue with its matching Canva demo and PDF', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)

    const selector = screen.getByLabelText('Catalogue preview')
    fireEvent.change(selector, { target: { value: 'en-oct' } })

    expect(screen.getByTitle('Catalogue preview: Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm) (1).pdf')
      .getAttribute('src'))
      .toBe('https://www.canva.com/design/DAHPRGqBzAM/SfktKLBglSZg6NRcaJUVPQ/view?embed')
    expect(screen.getByRole('link', { name: 'Download PDF' }).getAttribute('href'))
      .toBe('/catalogues/English/Oct%20EN_LoveLab_B2B_Catalogue%20(210%20x%20210%20mm)%20(1).pdf')
  })

  it('keeps the original English catalogue download in its new folder', () => {
    render(<ResourcesCard isAdmin={false} userEmail="agent@example.com" />)

    expect(screen.getByRole('link', { name: 'Download PDF' }).getAttribute('href'))
      .toBe('/catalogues/English/EN_LoveLab_B2B_Catalogue.pdf')
  })

  it('lists every new French PDF in the admin document catalogue folder', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)
    fireEvent.click(screen.getByText('Catalogue'))

    const documentLink = (fileName) => screen.getAllByText(fileName)
      .map((element) => element.closest('a'))
      .find(Boolean)

    expect(documentLink('Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf').getAttribute('href')).toBe(FRENCH_PDFS.generalSept)
    expect(documentLink('Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf').getAttribute('href')).toBe(FRENCH_PDFS.bijorkaSept)
    expect(documentLink('_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf').getAttribute('href')).toBe(FRENCH_PDFS.premiereFrance)
    expect(documentLink('Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf').getAttribute('href')).toBe(FRENCH_PDFS.premiereGeneral)
  })

  it('lists the second English PDF in the admin document catalogue folder', () => {
    render(<ResourcesCard isAdmin={true} userEmail="admin@example.com" />)
    fireEvent.click(screen.getByText('Catalogue'))

    const link = screen.getAllByText('Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm) (1).pdf')
      .map((element) => element.closest('a'))
      .find(Boolean)

    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe('/catalogues/English/Oct%20EN_LoveLab_B2B_Catalogue%20(210%20x%20210%20mm)%20(1).pdf')
  })
})
